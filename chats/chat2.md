# Lab data cleanup notes

_Started 2026-06-25 19:20 UTC_

---

## User

Need to remove the CPT codes as they are copyrighted.  Let's also remove Ratings as we have no way to allow users to rate the labs yet.  That might come in version 2.  
Under NORMAL RANGES, you still have TURNAROUND time, which should be removed

## Assistant

_[tool: read_file]_

_[tool: str_replace_edit]_

Let me find the exact text for the failing edit:

_[tool: grep]_

_[tool: grep]_

## Assistant

_[tool: str_replace_edit]_

All 14 edits applied. Let me surface it for you.

_[tool: ready_for_verification]_

Done. Here's what was removed:

- **CPT codes** — stripped from popular cards, browse list rows, search autocomplete, results header badge, search placeholder, and hero description
- **Ratings** — removed the Rating sort button, Rating table column, and all related JS
- **Turnaround under Normal Ranges** — the extra block inside that accordion section is gone

Quest and LabCorp codes are still shown (browse list subtitles, autocomplete, results header) since those aren't the copyright concern.

