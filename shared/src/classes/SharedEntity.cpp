#include "Class.h"
#include "cpp-sdk/ICore.h"

static void SyncedMetaGetter(js::DynamicPropertyGetterContext& ctx)
{
    if(!ctx.CheckParent()) return;
    alt::IEntity* obj = ctx.GetParent<alt::IEntity>();
    ctx.Return(obj->GetSyncedMetaData(ctx.GetProperty()));
}

static void SyncedMetaEnumerator(js::DynamicPropertyEnumeratorContext& ctx)
{
    if(!ctx.CheckParent()) return;
    alt::IEntity* obj = ctx.GetParent<alt::IEntity>();
    std::vector<std::string> keys = obj->GetSyncedMetaDataKeys();
    ctx.Return(keys);
}

static void StreamSyncedMetaGetter(js::DynamicPropertyGetterContext& ctx)
{
    if(!ctx.CheckParent()) return;
    alt::IEntity* obj = ctx.GetParent<alt::IEntity>();
    ctx.Return(obj->GetStreamSyncedMetaData(ctx.GetProperty()));
}

static void StreamSyncedMetaEnumerator(js::DynamicPropertyEnumeratorContext& ctx)
{
    if(!ctx.CheckParent()) return;
    alt::IEntity* obj = ctx.GetParent<alt::IEntity>();
    ctx.Return(obj->GetStreamSyncedMetaDataKeys());
}

// clang-format off
extern js::Class worldObjectClass;
extern js::Class sharedEntityClass("SharedEntity", &worldObjectClass, nullptr, [](js::ClassTemplate& tpl)
{
    tpl.LazyProperty<&alt::IEntity::GetID>("id");

    tpl.Property<&alt::IEntity::GetModel>("model");
    tpl.Property<&alt::IEntity::GetNetworkOwner>("netOwner");
    tpl.Property<&alt::IEntity::GetRotation, &alt::IEntity::SetRotation>("rot");
    tpl.Property<&alt::IEntity::GetVisible>("visible");

    tpl.DynamicProperty("syncedMeta", SyncedMetaGetter, nullptr, nullptr, SyncedMetaEnumerator);
    tpl.DynamicProperty("streamSyncedMeta", StreamSyncedMetaGetter, nullptr, nullptr, StreamSyncedMetaEnumerator);
});
