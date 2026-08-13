from app.repositories.push_token_repository import push_token_repository


async def register_push_token(user: dict, token: str):
    await push_token_repository.upsert(user["userId"], token)
    return {"ok": True}


async def unregister_push_token(user: dict, token: str):
    await push_token_repository.delete(user["userId"], token)
    return {"ok": True}
