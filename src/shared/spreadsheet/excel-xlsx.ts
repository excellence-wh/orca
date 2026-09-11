import ExcelJS from 'exceljs'
import type {
  SpreadsheetCell,
  SpreadsheetData,
  SpreadsheetRow,
  SpreadsheetWorksheet
} from './spreadsheet-data'

/**
 * XLSX <-> SpreadsheetData conversion backed by exceljs.
 *
 * Only the cell grid (and worksheet names) round-trip: formatting, formulas
 * and other workbook chrome are intentionally dropped. Formula cells are read
 * as their cached result so editing never ships a half-resolved formula.
 */

export class SpreadsheetParseError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'SpreadsheetParseError'
  }
}

function normalizeCellValue(value: unknown): SpreadsheetCell {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    // Rich text, hyperlink cells, and shared strings all expose .text.
    if (typeof obj.text === 'string') {
      return obj.text
    }
    // Formula cells: prefer the cached result so the grid shows a value.
    const result = obj.result
    if (result !== undefined) {
      return normalizeCellValue(result)
    }
  }
  return String(value)
}

export async function parseXlsxWorkbook(data: SpreadsheetDataOrSource): Promise<SpreadsheetData> {
  const bytes = toBytes(data)
  const workbook = new ExcelJS.Workbook()
  try {
    // Why: exceljs types the load input as a resizable Buffer; cast the
    // decoded blob (a plain Buffer/Uint8Array) so the generic aligns.
    await workbook.xlsx.load(bytes as never)
  } catch (error) {
    throw new SpreadsheetParseError('Not a readable .xlsx file.', error)
  }
  const worksheets: SpreadsheetWorksheet[] = workbook.worksheets.map((sheet) => {
    const rows: SpreadsheetRow[] = []
    sheet.eachRow((row, rowNumber) => {
      void rowNumber
      const cells: SpreadsheetCell[] = []
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        while (cells.length < colNumber - 1) {
          cells.push(null)
        }
        cells.push(normalizeCellValue(cell.value))
      })
      rows.push(cells)
    })
    return { name: sheet.name, rows }
  })
  return { worksheets, activeSheetIndex: 0 }
}

export async function serializeXlsxWorkbook(data: SpreadsheetData): Promise<string> {
  const workbook = new ExcelJS.Workbook()
  for (const sheet of data.worksheets) {
    const worksheet = workbook.addWorksheet(sheet.name)
    for (const row of sheet.rows) {
      worksheet.addRow([...row])
    }
  }
  const buffer = await workbook.xlsx.writeBuffer()
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  return Buffer.from(bytes).toString('base64')
}

type SpreadsheetDataOrSource = ArrayBuffer | Uint8Array | Buffer | string

function toBytes(source: SpreadsheetDataOrSource): Buffer {
  if (typeof source === 'string') {
    return Buffer.from(source, 'base64')
  }
  if (source instanceof Uint8Array) {
    return Buffer.from(source)
  }
  return Buffer.from(new Uint8Array(source))
}
