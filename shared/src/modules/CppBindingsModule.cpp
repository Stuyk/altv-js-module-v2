#include "Logger.h"
#include "Module.h"
#include "interfaces/IResource.h"
#include "FactoryHandler.h"
#include "magic_enum/include/magic_enum.hpp"

static void ToggleEvent(js::FunctionContext& ctx)
{
    if(!ctx.CheckArgCount(2)) return;

    alt::CEvent::Type type;
    if(!ctx.GetArg(0, type)) return;

    bool state;
    if(!ctx.GetArg(1, state)) return;

    alt::ICore::Instance().ToggleEvent(type, state);
}

static void SetEntityFactory(js::FunctionContext& ctx)
{
    if(!ctx.CheckArgCount(2)) return;

    alt::IBaseObject::Type type;
    if(!ctx.GetArg(0, type)) return;

    v8::Local<v8::Value> factory;
    if(!ctx.GetArg(1, factory)) return;

    js::IResource* resource = ctx.GetResource();
    if(!ctx.Check(!resource->HasCustomFactory(type), "Entity factory already set")) return;

    resource->SetCustomFactory(type, factory.As<v8::Function>());
}

static void GetEntityFactory(js::FunctionContext& ctx)
{
    if(!ctx.CheckArgCount(1)) return;

    alt::IBaseObject::Type type;
    if(!ctx.GetArg(0, type)) return;

    js::IResource* resource = ctx.GetResource();
    v8::Local<v8::Function> factory = resource->GetCustomFactory(type);
    if(factory.IsEmpty())
    {
        ctx.Return(nullptr);
        return;
    }
    ctx.Return(factory);
}

static void CreateEntity(js::FunctionContext& ctx)
{
    if(!ctx.CheckArgCount(2)) return;

    alt::IBaseObject::Type type;
    if(!ctx.GetArg(0, type)) return;

    js::Object args;
    if(!ctx.GetArg(1, args)) return;

    js::TryCatch tryCatch;
    alt::IBaseObject* object = js::FactoryHandler::Create(type, args);
    if(!object)
    {
        if(tryCatch.HasCaught()) tryCatch.ReThrow();
        else
            ctx.Throw("Failed to create entity of type " + std::string(magic_enum::enum_name(type)));
        return;
    }

    js::IResource* resource = ctx.GetResource();
    js::ScriptObject* scriptObject = resource->GetOrCreateScriptObject(ctx.GetContext(), object);
    if(!scriptObject)
    {
        if(tryCatch.HasCaught()) tryCatch.ReThrow();
        else
            ctx.Throw("Failed to create entity of type " + std::string(magic_enum::enum_name(type)));
        return;
    }

    js::Function func = resource->GetBindingExport<v8::Function>("entity:addEntityToAll");
    if(!ctx.Check(func.IsValid(), "INTERNAL ERROR: Failed to get entity:addEntityToAll function")) return;
    func.Call(scriptObject->Get());

    ctx.Return(scriptObject->Get());
}

static void GetAllEntities(js::FunctionContext& ctx)
{
    js::IResource* resource = ctx.GetResource();
    std::vector<alt::IEntity*> entities = alt::ICore::Instance().GetEntities();
    js::Array entitiesArr;
    for(auto& object : entities)
    {
        js::ScriptObject* scriptObject = resource->GetOrCreateScriptObject(ctx.GetContext(), object);
        if(!scriptObject) continue;
        entitiesArr.Push(scriptObject->Get());
    }
    ctx.Return(entities);
}

static void GetCurrentSourceLocation(js::FunctionContext& ctx)
{
    int framesToSkip = ctx.GetArg<int>(0, 0);

    js::Object obj;
    js::SourceLocation location = js::GetCurrentSourceLocation(ctx.GetResource(), framesToSkip);
    obj.Set("fileName", location.file);
    obj.Set("lineNumber", location.line);

    ctx.Return(obj);
}

static void RegisterExport(js::FunctionContext& ctx)
{
    if(!ctx.CheckArgCount(2)) return;

    std::string name;
    if(!ctx.GetArg(0, name)) return;

    v8::Local<v8::Value> value;
    if(!ctx.GetArg(1, value)) return;

    js::IResource* resource = ctx.GetResource();
    if(!ctx.Check(!resource->HasBindingExport(name), "Export already registered")) return;

    resource->SetBindingExport(name, value);
}

static void ResourceNameGetter(js::LazyPropertyContext& ctx)
{
    ctx.Return(ctx.GetResource()->GetResource()->GetName());
}

// clang-format off
// Used to provide C++ functions to the JS bindings
static js::Module cppBindingsModule("cppBindings", [](js::ModuleTemplate& module)
{
    module.StaticFunction("toggleEvent", ToggleEvent);
    module.StaticFunction("setEntityFactory", SetEntityFactory);
    module.StaticFunction("getEntityFactory", GetEntityFactory);

    module.StaticFunction("createEntity", CreateEntity);
    module.StaticFunction("getAllEntities", GetAllEntities);
    module.StaticFunction("getCurrentSourceLocation", GetCurrentSourceLocation);

    module.StaticFunction("registerExport", RegisterExport);

    module.StaticLazyProperty("resourceName", ResourceNameGetter);
});
