from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from app.database import get_session
from app.db_models import SkillProgressEvent
from app.deps import require_user
from app.schemas.skills import ProgressOut

router = APIRouter(prefix="/api/sessions", tags=["sessions"])

# Convention: coaching runs are recorded with progress `kind` == "session".


@router.get("", response_model=dict)
@router.get("/", response_model=dict, include_in_schema=False)
def list_session_events(
    user: dict = Depends(require_user),
    session: Session = Depends(get_session),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict:
    """Recent practice/coaching session events across all skills (see POST .../progress with kind=session)."""
    user_sub = str(user["id"])
    stmt = (
        select(SkillProgressEvent)
        .where(SkillProgressEvent.user_sub == user_sub)
        .where(SkillProgressEvent.kind == "session")
        .order_by(SkillProgressEvent.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = session.exec(stmt).all()
    return {
        "sessions": [
            ProgressOut(
                id=e.id,
                skill_id=e.skill_id,
                kind=e.kind,
                label=e.label,
                detail=e.detail,
                metric_value=e.metric_value,
                created_at=e.created_at,
            )
            for e in rows
        ]
    }
