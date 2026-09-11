import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { emptySpreadsheetData, type SpreadsheetData } from './spreadsheet-data'
import { parseXlsxWorkbook, serializeXlsxWorkbook } from './excel-xlsx'

async function buildFixtures(): Promise<{ base64: string }> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Data')
  sheet.addRow(['name', 'qty', 'in stock'])
  sheet.addRow(['widget', 4, true])
  sheet.addRow(['gadget', 11, false])
  // Deliberately sparse row: column 1 empty, value in column 3.
  sheet.addRow([null, 0, 'tail'])
  sheet.getCell('C5').value = null
  sheet.addRow(['skipped-mid'])
  sheet.getCell('C6').value = 42
  const buffer = await workbook.xlsx.writeBuffer()
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  return { base64: Buffer.from(bytes).toString('base64') }
}

describe('parseXlsxWorkbook', () => {
  it('round-trips cell values and names from an exceljs workbook', async () => {
    const { base64 } = await buildFixtures()
    const data = await parseXlsxWorkbook(base64)

    expect(data.worksheets).toHaveLength(1)
    expect(data.worksheets[0]!.name).toBe('Data')
    expect(data.worksheets[0]!.rows[0]).toEqual(['name', 'qty', 'in stock'])
    expect(data.worksheets[0]!.rows[1]).toEqual(['widget', 4, true])
    expect(data.worksheets[0]!.rows[2]).toEqual(['gadget', 11, false])
    // Sparse cells normalize to null with explicit gap fill.
    expect(data.worksheets[0]!.rows[3]).toEqual([null, 0, 'tail'])
    expect(data.worksheets[0]!.rows[4]).toEqual(['skipped-mid', null, 42])
  })

  it('rejects a buffer that is not a workbook', async () => {
    const garbage = Buffer.from('this is not a zip file').toString('base64')
    await expect(parseXlsxWorkbook(garbage)).rejects.toThrow()
  })

  it('returns empty worksheets when no rows exist', async () => {
    const workbook = new ExcelJS.Workbook()
    workbook.addWorksheet('Blank')
    const buffer = await workbook.xlsx.writeBuffer()
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
    const data = await parseXlsxWorkbook(Buffer.from(bytes).toString('base64'))
    expect(data.worksheets[0]!.rows).toEqual([])
  })
})

describe('serializeXlsxWorkbook', () => {
  it('round-trips a SpreadsheetData back to readable cells', async () => {
    const data: SpreadsheetData = emptySpreadsheetData('Round')
    data.worksheets[0]!.rows = [
      ['a', 'b'],
      [1, 'two'],
      [null, true]
    ]
    const base64 = await serializeXlsxWorkbook(data)
    const parsed = await parseXlsxWorkbook(base64)
    expect(parsed.worksheets[0]!.name).toBe('Round')
    expect(parsed.worksheets[0]!.rows).toEqual([
      ['a', 'b'],
      [1, 'two'],
      [null, true]
    ])
  })

  it('serializes multiple worksheets preserving names', async () => {
    const data: SpreadsheetData = {
      worksheets: [
        { name: 'One', rows: [['x']] },
        { name: 'Two', rows: [['y', 2]] }
      ],
      activeSheetIndex: 1
    }
    const base64 = await serializeXlsxWorkbook(data)
    const parsed = await parseXlsxWorkbook(base64)
    expect(parsed.worksheets.map((ws) => ws.name)).toEqual(['One', 'Two'])
    expect(parsed.worksheets[1]!.rows).toEqual([['y', 2]])
  })
})
