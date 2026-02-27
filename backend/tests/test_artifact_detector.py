"""Tests for the artifact detection module (backend/app/artifact_detector.py).

Verifies detection of JSON blocks, markdown tables, report blocks,
dashboard blocks, and heading-based detection.
"""

from __future__ import annotations

import pytest

from app.artifact_detector import Artifact, ArtifactDetector, ArtifactType


@pytest.fixture
def detector() -> ArtifactDetector:
    """Provide a fresh ArtifactDetector instance."""
    return ArtifactDetector()


# ---------------------------------------------------------------------------
# JSON detection
# ---------------------------------------------------------------------------

class TestJsonDetection:
    """Tests for JSON code block detection."""

    def test_detects_json_block(self, detector: ArtifactDetector) -> None:
        """Should detect a ```json code block."""
        text = """Here is the result:

```json
{"name": "Server Report", "count": 42}
```

Done.
"""
        artifacts = detector.detect(text)
        json_artifacts = [a for a in artifacts if a.artifact_type == ArtifactType.JSON_DATA]
        assert len(json_artifacts) == 1
        assert json_artifacts[0].content["count"] == 42

    def test_detects_unnamed_json_block(self, detector: ArtifactDetector) -> None:
        """Should detect a code block without the json label if it contains valid JSON."""
        text = """Result:

```
{"status": "ok", "items": [1, 2, 3]}
```
"""
        artifacts = detector.detect(text)
        json_artifacts = [a for a in artifacts if a.artifact_type == ArtifactType.JSON_DATA]
        assert len(json_artifacts) == 1
        assert json_artifacts[0].content["status"] == "ok"

    def test_ignores_invalid_json(self, detector: ArtifactDetector) -> None:
        """Should not produce artifacts for code blocks with invalid JSON."""
        text = """Code:

```json
this is not valid json {{{
```
"""
        artifacts = detector.detect(text)
        json_artifacts = [a for a in artifacts if a.artifact_type == ArtifactType.JSON_DATA]
        assert len(json_artifacts) == 0

    def test_multiple_json_blocks(self, detector: ArtifactDetector) -> None:
        """Should detect multiple JSON blocks in a single response."""
        text = """Results:

```json
{"title": "Report A", "score": 90}
```

And also:

```json
{"title": "Report B", "score": 85}
```
"""
        artifacts = detector.detect(text)
        json_artifacts = [a for a in artifacts if a.artifact_type == ArtifactType.JSON_DATA]
        assert len(json_artifacts) == 2

    def test_json_title_from_content(self, detector: ArtifactDetector) -> None:
        """Title should be extracted from the JSON content if available."""
        text = '```json\n{"title": "Compliance Summary"}\n```'
        artifacts = detector.detect(text)
        assert len(artifacts) >= 1
        json_artifacts = [a for a in artifacts if a.artifact_type == ArtifactType.JSON_DATA]
        assert json_artifacts[0].title == "Compliance Summary"


# ---------------------------------------------------------------------------
# Table detection
# ---------------------------------------------------------------------------

class TestTableDetection:
    """Tests for markdown table detection.

    Table extraction is intentionally disabled in detect() so that
    react-markdown renders tables natively with SN links and footer
    intact.  These tests verify the disabled behavior.
    """

    def test_tables_not_extracted(self, detector: ArtifactDetector) -> None:
        """Tables should NOT be extracted as artifacts (disabled for native rendering)."""
        text = """Results:

| Server | Status | IP |
|--------|--------|----|
| web-01 | online | 10.0.0.1 |
| web-02 | offline | 10.0.0.2 |
| db-01 | online | 10.0.1.1 |

Done.
"""
        artifacts = detector.detect(text)
        table_artifacts = [a for a in artifacts if a.artifact_type == ArtifactType.TABLE]
        assert len(table_artifacts) == 0

    def test_ignores_single_row(self, detector: ArtifactDetector) -> None:
        """A single pipe-delimited line should not be detected as a table."""
        text = "| just one line |"
        artifacts = detector.detect(text)
        table_artifacts = [a for a in artifacts if a.artifact_type == ArtifactType.TABLE]
        assert len(table_artifacts) == 0

    def test_requires_separator_row(self, detector: ArtifactDetector) -> None:
        """A table without a separator row (|---|) should not be detected."""
        text = """| Header |
| Data |
| More |
"""
        artifacts = detector.detect(text)
        table_artifacts = [a for a in artifacts if a.artifact_type == ArtifactType.TABLE]
        assert len(table_artifacts) == 0


# ---------------------------------------------------------------------------
# Report block detection
# ---------------------------------------------------------------------------

class TestReportDetection:
    """Tests for ```report block detection."""

    def test_detects_report_block(self, detector: ArtifactDetector) -> None:
        """Should detect an explicit ```report block."""
        text = """Here is your report:

```report
COMPLIANCE REPORT
-----------------
Overall Score: 85%
Critical Issues: 2
Warning Issues: 5
```
"""
        artifacts = detector.detect(text)
        report_artifacts = [a for a in artifacts if a.artifact_type == ArtifactType.REPORT]
        assert len(report_artifacts) == 1
        assert "COMPLIANCE REPORT" in report_artifacts[0].raw_content

    def test_report_block_with_json(self, detector: ArtifactDetector) -> None:
        """A report block containing JSON should parse the JSON content."""
        text = '```report\n{"title": "Audit Results", "score": 92}\n```'
        artifacts = detector.detect(text)
        report_artifacts = [a for a in artifacts if a.artifact_type == ArtifactType.REPORT]
        assert len(report_artifacts) == 1
        assert report_artifacts[0].title == "Audit Results"
        assert report_artifacts[0].content["score"] == 92


# ---------------------------------------------------------------------------
# Dashboard block detection
# ---------------------------------------------------------------------------

class TestDashboardDetection:
    """Tests for ```dashboard block detection."""

    def test_detects_dashboard_block(self, detector: ArtifactDetector) -> None:
        """Should detect an explicit ```dashboard block."""
        text = """Dashboard:

```dashboard
{"title": "Health Dashboard", "metrics": {"cpu": 45, "memory": 72}}
```
"""
        artifacts = detector.detect(text)
        dash_artifacts = [a for a in artifacts if a.artifact_type == ArtifactType.DASHBOARD]
        assert len(dash_artifacts) == 1
        assert dash_artifacts[0].title == "Health Dashboard"
        assert dash_artifacts[0].content["metrics"]["cpu"] == 45


# ---------------------------------------------------------------------------
# Heading-based detection
# ---------------------------------------------------------------------------

class TestHeadingDetection:
    """Tests for heading-based report/dashboard detection."""

    def test_detects_compliance_heading(self, detector: ArtifactDetector) -> None:
        """Should detect a heading indicating a compliance report."""
        text = """## COMPLIANCE REPORT

Overall Score: 95%

### Findings

All systems compliant.
"""
        artifacts = detector.detect(text)
        report_artifacts = [a for a in artifacts if a.artifact_type == ArtifactType.REPORT]
        assert len(report_artifacts) == 1
        assert "COMPLIANCE REPORT" in report_artifacts[0].title

    def test_detects_health_metrics_heading(self, detector: ArtifactDetector) -> None:
        """Should detect a heading indicating health metrics (dashboard type)."""
        text = """# HEALTH METRICS

CPU: 45%
Memory: 72%
Disk: 60%
"""
        artifacts = detector.detect(text)
        dash_artifacts = [a for a in artifacts if a.artifact_type == ArtifactType.DASHBOARD]
        assert len(dash_artifacts) == 1

    def test_heading_not_triggered_with_explicit_blocks(self, detector: ArtifactDetector) -> None:
        """Heading detection should be suppressed when explicit blocks are present."""
        text = """## COMPLIANCE REPORT

```report
Detailed report here
```
"""
        artifacts = detector.detect(text)
        # Should have the report block artifact, but not a duplicate from heading
        report_artifacts = [a for a in artifacts if a.artifact_type == ArtifactType.REPORT]
        assert len(report_artifacts) == 1
        assert report_artifacts[0].metadata.get("source") == "report_block"


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    """Edge case and boundary tests."""

    def test_empty_input(self, detector: ArtifactDetector) -> None:
        """Empty input should return no artifacts."""
        assert detector.detect("") == []
        assert detector.detect("   ") == []

    def test_plain_text_no_artifacts(self, detector: ArtifactDetector) -> None:
        """Plain text with no structured content should return no artifacts."""
        text = "This is a normal response with no special formatting."
        assert detector.detect(text) == []

    def test_artifact_has_unique_id(self, detector: ArtifactDetector) -> None:
        """Each artifact should have a unique ID."""
        text = """
```json
{"a": 1}
```

```json
{"b": 2}
```
"""
        artifacts = detector.detect(text)
        ids = [a.artifact_id for a in artifacts]
        assert len(ids) == len(set(ids))


# ---------------------------------------------------------------------------
# Serialization for frontend
# ---------------------------------------------------------------------------

class TestSerializeForFrontend:
    """Tests for ArtifactDetector.serialize_for_frontend()."""

    def test_field_mapping(self) -> None:
        """Should map artifact_id -> id, artifact_type -> type, and strip raw_content."""
        artifact = Artifact(
            artifact_id="abc-123",
            artifact_type=ArtifactType.REPORT,
            title="Test Report",
            content="report content",
            raw_content="raw stuff",
        )
        result = ArtifactDetector.serialize_for_frontend([artifact])
        assert len(result) == 1
        assert result[0]["id"] == "abc-123"
        assert result[0]["type"] == "report"
        assert result[0]["title"] == "Test Report"
        assert result[0]["content"] == "report content"
        assert "raw_content" not in result[0]

    def test_json_data_maps_to_code(self) -> None:
        """ArtifactType.JSON_DATA should map to 'code' for the frontend."""
        artifact = Artifact(
            artifact_type=ArtifactType.JSON_DATA,
            title="JSON Data",
            content={"key": "value"},
            raw_content='{"key": "value"}',
        )
        result = ArtifactDetector.serialize_for_frontend([artifact])
        assert result[0]["type"] == "code"

    def test_dict_content_serialized_to_string(self) -> None:
        """Non-string content (dict) should be JSON-serialized."""
        artifact = Artifact(
            artifact_type=ArtifactType.TABLE,
            title="Table",
            content={"headers": ["A"], "rows": [["1"]]},
            raw_content="| A |\n|---|\n| 1 |",
        )
        result = ArtifactDetector.serialize_for_frontend([artifact])
        assert isinstance(result[0]["content"], str)
        assert '"headers"' in result[0]["content"]

    def test_empty_list(self) -> None:
        """Empty input should return empty output."""
        result = ArtifactDetector.serialize_for_frontend([])
        assert result == []

    def test_metadata_preserved(self) -> None:
        """Metadata should be passed through to the frontend."""
        artifact = Artifact(
            artifact_type=ArtifactType.DASHBOARD,
            title="Dashboard",
            content="data",
            raw_content="data",
            metadata={"source": "dashboard_block"},
        )
        result = ArtifactDetector.serialize_for_frontend([artifact])
        assert result[0]["metadata"] == {"source": "dashboard_block"}

    def test_other_types_unchanged(self) -> None:
        """Types without a mapping (report, dashboard, table, etc.) stay as-is."""
        for art_type in (ArtifactType.REPORT, ArtifactType.DASHBOARD, ArtifactType.TABLE, ArtifactType.DOCUMENT, ArtifactType.CHART):
            artifact = Artifact(
                artifact_type=art_type,
                title="Test",
                content="x",
                raw_content="x",
            )
            result = ArtifactDetector.serialize_for_frontend([artifact])
            assert result[0]["type"] == art_type.value
