#include "IResource.h"

alt::MValue js::IResource::Function::Call(alt::MValueArgs args) const
{
    auto& core = alt::ICore::Instance();
    if(!resource->GetResource()->IsStarted()) return core.CreateMValueNone();

    v8::Isolate* isolate = resource->GetIsolate();
    v8::Local<v8::Context> context = resource->GetContext();
    v8::Locker locker(isolate);
    v8::Isolate::Scope isolateScope(isolate);
    v8::HandleScope handleScope(isolate);
    v8::Context::Scope contextScope(context);

    v8::Local<v8::Function> jsFunc = function.Get(isolate);
    std::vector<v8::Local<v8::Value>> jsArgs;
    jsArgs.reserve(args.size());
    for(size_t i = 0; i < args.size(); ++i) jsArgs.push_back(MValueToJS(args[i]));

    js::Function func(jsFunc);
    auto result = func.Call<alt::MValue>(jsArgs);
    if(!result) return core.CreateMValueNone();
    return result.value();
}

void js::IResource::Function::ExternalFunctionCallback(const v8::FunctionCallbackInfo<v8::Value>& info)
{
    alt::MValueFunctionConst* func = static_cast<alt::MValueFunctionConst*>(info.Data().As<v8::External>()->Value());
    alt::MValueArgs args;
    args.reserve(info.Length());
    for(size_t i = 0; i < info.Length(); ++i) args.push_back(JSToMValue(info[i]));
    alt::MValue retValue = (*func)->Call(args);
    info.GetReturnValue().Set(MValueToJS(retValue));
}

void js::IResource::RequireBindingNamespaceWrapper(js::FunctionContext& ctx)
{
    if(!ctx.CheckArgCount(1)) return;

    std::string bindingName;
    if(!ctx.GetArg(0, bindingName)) return;

    Binding& binding = Binding::Get(bindingName);
    if(!ctx.Check(binding.IsValid(), "Invalid binding name")) return;
    IResource* resource = ctx.GetResource();
    if(!resource) return;

    v8::Local<v8::Module> bindingModule = binding.GetCompiledModule(resource);
    if(bindingModule->GetStatus() != v8::Module::Status::kEvaluated) resource->InitializeBinding(&binding);
    ctx.Return(bindingModule->GetModuleNamespace());
}

void js::IResource::InitializeBinding(js::Binding* binding)
{
    if(binding->GetName().ends_with("bootstrap.js")) return;  // Skip bootstrap bindings, those are handled separately

    v8::Local<v8::Module> module = binding->GetCompiledModule(this);
    if(module.IsEmpty())
    {
        Logger::Error("INTERNAL ERROR: Failed to compile binding module", binding->GetName());
        return;
    }
    if(module->GetStatus() == v8::Module::Status::kEvaluated) return;

    if(module->GetStatus() == v8::Module::Status::kEvaluating)
    {
        Logger::Error("INTERNAL ERROR: Binding module", binding->GetName(), "is already evaluating; circular dependency?");
        return;
    }

    module->Evaluate(GetContext());
    if(module->GetStatus() != v8::Module::Status::kEvaluated)
    {
        Logger::Error("INTERNAL ERROR: Failed to evaluate binding module", binding->GetName());
        v8::Local<v8::Value> exception = module->GetException();
        if(!exception.IsEmpty()) Logger::Error("INTERNAL ERROR:", *v8::String::Utf8Value(isolate, exception));
    }
}

void js::IResource::InitializeBindings(Binding::Scope scope, Module& altModule)
{
    std::vector<Binding*> bindings = Binding::GetBindingsForScope(scope);
    v8::Local<v8::Context> ctx = GetContext();

    {
        TemporaryGlobalExtension altExtension(ctx, "__alt", altModule.GetNamespace(this));
        TemporaryGlobalExtension cppBindingsExtension(ctx, "__cppBindings", Module::Get("cppBindings").GetNamespace(this));
        TemporaryGlobalExtension requireBindingExtension(ctx, "requireBinding", RequireBindingNamespaceWrapper);

        for(Binding* binding : bindings) InitializeBinding(binding);
    }
}

extern js::Class resourceClass;
v8::Local<v8::Object> js::IResource::CreateResourceObject(alt::IResource* resource)
{
    if(resourceObjects.contains(resource)) return resourceObjects.at(resource).Get(isolate);
    v8::Local<v8::Object> resourceObj = resourceClass.Create(GetContext(), resource);
    resourceObjects.insert({ resource, resourceClass.MakePersistent(resourceObj) });
    return resourceObj;
}

extern js::Class baseObjectClass;
bool js::IResource::IsBaseObject(v8::Local<v8::Value> val)
{
    return val->IsObject() && val.As<v8::Object>()->InstanceOf(GetContext(), baseObjectClass.GetTemplate(isolate).Get()->GetFunction(GetContext()).ToLocalChecked()).ToChecked();
}
