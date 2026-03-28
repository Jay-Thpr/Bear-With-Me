from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_optional_user

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/me")
def me(user: dict | None = Depends(get_optional_user)) -> dict:
    """Current user profile (requires session cookie)."""
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user
