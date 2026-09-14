import { describe, expect, it } from 'vitest'
import type { SpreadsheetData } from '../../../../shared/spreadsheet/spreadsheet-data'
import {
  cloneSpreadsheetData,
  parseSpreadsheetCellValue,
  setSpreadsheetCell
} from './spreadsheet-cell-edit'

function workbook(rows: SpreadsheetData['worksheets'][number]['rows']): SpreadsheetData {
  return { worksheets: [{ name: 'Sheet1', rows }], activeSheetIndex: 0 }
}

describe('setSpreadsheetCell', () => {
  it('leaves the workbook it was given untouched', () => {
    const original = workbook([['a', 'b']])

    const next = setSpreadsheetCell(original, 0, 0, 0, 'changed')

    expect(next).not.toBe(original)
    expect(next.worksheets[0]!.rows[0]![0]).toBe('changed')
    // A second invocation must not see the first edit (React may re-run the updater).
    expect(original.worksheets[0]!.rows[0]![0]).toBe('a')
    expect(setSpreadsheetCell(original, 0, 1, 0, 'second').worksheets[0]!.rows[1]![0]).toBe(
      'second'
    )
    expect(original.worksheets[0]!.rows).toHaveLength(1)
  })

  it('grows the sheet to reach a cell beyond the current extent', () => {
    const original = workbook([['a']])

    const next = setSpreadsheetCell(original, 0, 2, 1, 'far')

    expect(next.worksheets[0]!.rows).toHaveLength(3)
    expect(next.worksheets[0]!.rows[2]).toEqual([null, 'far'])
    expect(next.worksheets[0]!.rows[1]).toEqual([])
  })

  it('writes to the targeted sheet only', () => {
    const original: SpreadsheetData = {
      worksheets: [
        { name: 'First', rows: [['a']] },
        { name: 'Second', rows: [['b']] }
      ],
      activeSheetIndex: 0
    }

    const next = setSpreadsheetCell(original, 1, 0, 0, 'edited')

    expect(next.worksheets[1]!.rows[0]![0]).toBe('edited')
    expect(next.worksheets[0]!.rows[0]![0]).toBe('a')
  })
})

describe('cloneSpreadsheetData', () => {
  it('copies nested rows rather than sharing them', () => {
    const original = workbook([['a']])

    const clone = cloneSpreadsheetData(original)
    clone.worksheets[0]!.rows[0]![0] = 'mutated'
    clone.worksheets[0]!.rows.push(['extra'])

    expect(original.worksheets[0]!.rows[0]![0]).toBe('a')
    expect(original.worksheets[0]!.rows).toHaveLength(1)
  })
})

describe('parseSpreadsheetCellValue', () => {
  it('coerces whole and decimal numbers', () => {
    expect(parseSpreadsheetCellValue('42')).toBe(42)
    expect(parseSpreadsheetCellValue('-3.5')).toBe(-3.5)
    expect(parseSpreadsheetCellValue('0.25')).toBe(0.25)
    // Typed cells are values, so leading zeros become the number (unlike a CSV
    // field, which stays raw text through buildPatchRows).
    expect(parseSpreadsheetCellValue('00123')).toBe(123)
  })

  it('keeps text that only looks numeric as text', () => {
    expect(parseSpreadsheetCellValue('1e5')).toBe('1e5')
    expect(parseSpreadsheetCellValue('9007199254740993')).toBe('9007199254740993')
    expect(parseSpreadsheetCellValue('2026-09-14')).toBe('2026-09-14')
    expect(parseSpreadsheetCellValue('12abc')).toBe('12abc')
  })

  it('clears a cell when the text is emptied', () => {
    expect(parseSpreadsheetCellValue('')).toBeNull()
  })
})
