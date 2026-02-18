"""Artifact detection for structured content in agent responses.

Scans agent response text for recognizable patterns -- JSON code blocks,
markdown tables, report sections, and dashboard metrics -- and extracts
them as typed Artifact objects for rendering in the frontend.
"""

from __future__ import annotations

import json
import re
import uuid
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

class ArtifactType(str, Enum):
    """The category of a detected artifact."""

    REPORT = "report"
    DASHBOARD = "dashboard"
    DOCUMENT = "document"
    TABLE = "table"
    CHART = "chart"
    JSON_DATA = "json_data"


class Artifact(BaseModel):
    """A structured artifact extracted from agent response text."""

    artifact_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    artifact_type: ArtifactType
    title: str
    content: Any
    raw_content: str
    metadata: dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Detector
# ---------------------------------------------------------------------------

# Pre-compiled regex patterns used across detection methods.
_JSON_BLOCK_RE = re.compile(
    r"```(?:json)?\s*\n([\s\S]*?)```",
    re.MULTILINE,
)

_TABLE_BLOCK_RE = re.compile(
    r"((?:^\|.*\|$\n?){2,})",
    re.MULTILINE,
)

_REPORT_BLOCK_RE = re.compile(
    r"```report\s*\n([\s\S]*?)```",
    re.MULTILINE,
)

_DASHBOARD_BLOCK_RE = re.compile(
    r"```dashboard\s*\n([\s\S]*?)```",
    re.MULTILINE,
)

_REPORT_HEADING_RE = re.compile(
    r"^#+\s+.*(COMPLIANCE|AUDIT|REPORT|ASSESSMENT|HEALTH|METRICS).*$",
    re.IGNORECASE | re.MULTILINE,
)


class ArtifactDetector:
    """Detects and parses structured artifacts in agent response text.

    The detector checks for:
    - JSON code blocks (````` ```json ... ``` `````)
    - Markdown tables (pipe-delimited rows)
    - Report blocks (````` ```report ... ``` `````)
    - Dashboard blocks (````` ```dashboard ... ``` `````)
    - Natural language headings that indicate reports or dashboards
    """

    def detect(self, response_text: str) -> list[Artifact]:
        """Scan *response_text* and return all detected artifacts."""
        if not response_text or not response_text.strip():
            return []

        artifacts: list[Artifact] = []
        artifacts.extend(self._detect_dashboard_blocks(response_text))
        artifacts.extend(self._detect_report_blocks(response_text))
        artifacts.extend(self._detect_json_blocks(response_text))
        artifacts.extend(self._detect_table_blocks(response_text))
        artifacts.extend(self._detect_report_headings(response_text))
        return artifacts

    # -- JSON blocks --------------------------------------------------------

    def _detect_json_blocks(self, text: str) -> list[Artifact]:
        """Extract JSON code blocks and parse their content."""
        artifacts: list[Artifact] = []

        for match in _JSON_BLOCK_RE.finditer(text):
            raw = match.group(1).strip()
            try:
                parsed = json.loads(raw)
            except (json.JSONDecodeError, ValueError):
                continue

            # Infer a title from the JSON content
            title = "JSON Data"
            if isinstance(parsed, dict):
                title = parsed.get("title", parsed.get("name", "JSON Data"))

            artifacts.append(
                Artifact(
                    artifact_type=ArtifactType.JSON_DATA,
                    title=str(title),
                    content=parsed,
                    raw_content=raw,
                    metadata={"source": "json_code_block"},
                )
            )

        return artifacts

    # -- Table blocks -------------------------------------------------------

    def _detect_table_blocks(self, text: str) -> list[Artifact]:
        """Extract markdown tables (pipe-delimited rows)."""
        artifacts: list[Artifact] = []

        for match in _TABLE_BLOCK_RE.finditer(text):
            raw = match.group(1).strip()
            lines = [line.strip() for line in raw.split("\n") if line.strip()]

            # A valid markdown table needs at least a header row and a separator row
            if len(lines) < 2:
                continue

            # Check that the second line is a separator (e.g., |---|---|)
            separator = lines[1]
            if not re.match(r"^\|[\s\-:|]+\|$", separator):
                continue

            # Parse headers
            headers = [
                cell.strip()
                for cell in lines[0].split("|")
                if cell.strip()
            ]

            # Parse data rows
            rows: list[list[str]] = []
            for line in lines[2:]:
                cells = [cell.strip() for cell in line.split("|") if cell.strip()]
                rows.append(cells)

            title = "Table"
            if headers:
                title = f"Table ({len(rows)} rows)"

            artifacts.append(
                Artifact(
                    artifact_type=ArtifactType.TABLE,
                    title=title,
                    content={"headers": headers, "rows": rows},
                    raw_content=raw,
                    metadata={
                        "source": "markdown_table",
                        "row_count": len(rows),
                        "columns": headers,
                    },
                )
            )

        return artifacts

    # -- Report blocks ------------------------------------------------------

    def _detect_report_blocks(self, text: str) -> list[Artifact]:
        """Extract explicit ```report ... ``` code blocks."""
        artifacts: list[Artifact] = []

        for match in _REPORT_BLOCK_RE.finditer(text):
            raw = match.group(1).strip()

            # Try to parse as JSON first; fall back to raw text
            try:
                content = json.loads(raw)
                title = content.get("title", "Report") if isinstance(content, dict) else "Report"
            except (json.JSONDecodeError, ValueError):
                content = raw
                title = "Report"

            artifacts.append(
                Artifact(
                    artifact_type=ArtifactType.REPORT,
                    title=str(title),
                    content=content,
                    raw_content=raw,
                    metadata={"source": "report_block"},
                )
            )

        return artifacts

    # -- Dashboard blocks ---------------------------------------------------

    def _detect_dashboard_blocks(self, text: str) -> list[Artifact]:
        """Extract explicit ```dashboard ... ``` code blocks."""
        artifacts: list[Artifact] = []

        for match in _DASHBOARD_BLOCK_RE.finditer(text):
            raw = match.group(1).strip()

            try:
                content = json.loads(raw)
                title = (
                    content.get("title", "Dashboard")
                    if isinstance(content, dict)
                    else "Dashboard"
                )
            except (json.JSONDecodeError, ValueError):
                content = raw
                title = "Dashboard"

            artifacts.append(
                Artifact(
                    artifact_type=ArtifactType.DASHBOARD,
                    title=str(title),
                    content=content,
                    raw_content=raw,
                    metadata={"source": "dashboard_block"},
                )
            )

        return artifacts

    # -- Report headings (natural language) ---------------------------------

    def _detect_report_headings(self, text: str) -> list[Artifact]:
        """Detect headings that indicate a report or dashboard section.

        Only produces an artifact if a heading is found but no explicit
        report or dashboard block was already matched for the same content.
        """
        artifacts: list[Artifact] = []

        # Skip if we already detected explicit report/dashboard blocks
        if _REPORT_BLOCK_RE.search(text) or _DASHBOARD_BLOCK_RE.search(text):
            return artifacts

        matches = list(_REPORT_HEADING_RE.finditer(text))
        if not matches:
            return artifacts

        # Use the first heading as the title and the full text as content
        heading_text = matches[0].group(0).lstrip("#").strip()

        # Determine artifact type from heading keywords
        heading_upper = heading_text.upper()
        if any(kw in heading_upper for kw in ("HEALTH", "METRICS", "DASHBOARD")):
            artifact_type = ArtifactType.DASHBOARD
        else:
            artifact_type = ArtifactType.REPORT

        artifacts.append(
            Artifact(
                artifact_type=artifact_type,
                title=heading_text,
                content=text,
                raw_content=text,
                metadata={"source": "heading_detection"},
            )
        )

        return artifacts
