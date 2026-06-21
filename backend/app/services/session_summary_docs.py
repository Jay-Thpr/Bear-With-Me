"""Optional Google Docs export for persisted session summaries.

Best-effort only. Runtime coaching must not depend on this.
"""

from __future__ import annotations

import json
from datetime import timezone

from app.config import settings
from app.db_models import Skill, SkillSessionSummary


def _get_or_create_doc_id(
    *,
    docs: object,
    drive: object,
    title: str,
    folder_id: str | None,
) -> str:
    document_id = _find_doc_id(drive=drive, title=title, folder_id=folder_id)
    if not document_id:
        document_id = _create_doc(docs=docs, drive=drive, title=title, folder_id=folder_id)
    return document_id


def _append_block_to_doc(*, docs: object, document_id: str, block: str) -> None:
    doc = docs.documents().get(documentId=document_id).execute()  # type: ignore[attr-defined]
    end_index = max(1, (doc.get("body", {}).get("content", [{}])[-1].get("endIndex", 1) or 1) - 1)
    docs.documents().batchUpdate(  # type: ignore[attr-defined]
        documentId=document_id,
        body={
            "requests": [
                {
                    "insertText": {
                        "location": {"index": end_index},
                        "text": block,
                    }
                }
            ]
        },
    ).execute()


def export_session_summary_to_docs(
    *,
    summary: SkillSessionSummary,
    skill: Skill,
    user_email: str | None,
) -> dict[str, str] | None:
    if not settings.google_docs_service_account_json.strip():
        return None

    from google.oauth2.service_account import Credentials  # type: ignore[import-not-found]
    from googleapiclient.discovery import build  # type: ignore[import-not-found]

    creds_info = json.loads(settings.google_docs_service_account_json)
    creds = Credentials.from_service_account_info(
        creds_info,
        scopes=[
            "https://www.googleapis.com/auth/documents",
            "https://www.googleapis.com/auth/drive",
        ],
    )

    docs = build("docs", "v1", credentials=creds, cache_discovery=False)
    drive = build("drive", "v3", credentials=creds, cache_discovery=False)

    owner = user_email or summary.user_sub
    title = f"Skill Quest — {owner} — {skill.title} Session Summaries"
    folder_id = settings.google_docs_export_folder_id.strip() or None

    document_id = _get_or_create_doc_id(
        docs=docs, drive=drive, title=title, folder_id=folder_id
    )
    block = _format_summary_block(summary=summary, skill=skill)
    _append_block_to_doc(docs=docs, document_id=document_id, block=block)

    return {
        "document_id": document_id,
        "document_url": f"https://docs.google.com/document/d/{document_id}/edit",
    }


def _find_doc_id(*, drive: object, title: str, folder_id: str | None) -> str | None:
    safe_title = title.replace("'", "\\'")
    clauses = [
        "mimeType='application/vnd.google-apps.document'",
        "trashed=false",
        f"name='{safe_title}'",
    ]
    if folder_id:
        clauses.append(f"'{folder_id}' in parents")
    res = drive.files().list(  # type: ignore[attr-defined]
        q=" and ".join(clauses),
        fields="files(id)",
        pageSize=1,
    ).execute()
    files = res.get("files") or []
    if not files:
        return None
    return files[0].get("id")


def _create_doc(*, docs: object, drive: object, title: str, folder_id: str | None) -> str:
    created = docs.documents().create(body={"title": title}).execute()  # type: ignore[attr-defined]
    document_id = created["documentId"]
    if folder_id:
        file = drive.files().get(fileId=document_id, fields="parents").execute()  # type: ignore[attr-defined]
        parents = ",".join(file.get("parents", []))
        drive.files().update(  # type: ignore[attr-defined]
            fileId=document_id,
            addParents=folder_id,
            removeParents=parents,
            fields="id, parents",
        ).execute()
    return document_id


def _format_summary_block(*, summary: SkillSessionSummary, skill: Skill) -> str:
    created = summary.created_at.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = [
        "\n\n=====================================",
        f"SESSION {summary.session_number} - {created}",
        "=====================================",
        f"Skill: {skill.title}",
        f"Duration: {summary.duration_seconds} seconds",
        f"Coach note: {summary.coach_note or 'n/a'}",
        f"Progress delta: {summary.progress_delta:.1f}",
        f"Level ups: {summary.level_ups}",
        f"Mastered delta: {summary.mastered_delta}",
        "",
        "Summary",
        summary.summary_text,
    ]
    if summary.input_notes:
        lines.extend(["", "Learner / coach notes", summary.input_notes])
    return "\n".join(lines)
