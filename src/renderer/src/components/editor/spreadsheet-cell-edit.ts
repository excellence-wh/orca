import type {
  SpreadsheetCell,
  SpreadsheetData
} from '../../../../shared/spreadsheet/spreadsheet-data'

/** Deep copy, so a React state updater can run twice without touching the previous workbook. */
export function cloneSpreadsheetData(data: SpreadsheetData): SpreadsheetData {
  return {
    worksheets: data.worksheets.map((sheet) => ({
      name: sheet.name,
      rows: sheet.rows.map((row) => [...row])
    })),
    activeSheetIndex: data.activeSheetIndex
  }
}

function growToCell(
  data: SpreadsheetData,
  sheetIndex: number,
  rowIndex: number,
  colIndex: number
): void {
  const sheet = data.worksheets[sheetIndex]!
  while (sheet.rows.length <= rowIndex) {
    sheet.rows.push([])
  }
  while (sheet.rows[rowIndex]!.length <= colIndex) {
    sheet.rows[rowIndex]!.push(null)
  }
}

/** An edited text cell becomes a number only when the whole value is one; else it stays text. */
export function parseSpreadsheetCellValue(raw: string): SpreadsheetCell {
  if (raw === '') {
    return null
  }
  if (/^-?\d+$/.test(raw)) {
    const n = Number(raw)
    if (Number.isSafeInteger(n)) {
      return n
    }
  }
  if (/^-?\d*\.\d+$/.test(raw)) {
    const n = Number(raw)
    if (Number.isFinite(n)) {
      return n
    }
  }
  return raw
}

/**
 * Writes one cell and returns a new workbook; `data` is left untouched so callers may hold the
 * previous state (React, for one, can invoke a state updater more than once).
 */
export function setSpreadsheetCell(
  data: SpreadsheetData,
  sheetIndex: number,
  rowIndex: number,
  colIndex: number,
  value: SpreadsheetCell
): SpreadsheetData {
  const next = cloneSpreadsheetData(data)
  growToCell(next, sheetIndex, rowIndex, colIndex)
  next.worksheets[sheetIndex]!.rows[rowIndex]![colIndex] = value
  return next
}
