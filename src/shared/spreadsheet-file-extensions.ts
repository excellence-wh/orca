export const SPREADSHEET_FILE_MIME_TYPES: Record<string, string> = {
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel'
}

export const SPREADSHEET_FILE_EXTENSIONS = Object.freeze(
  Object.keys(SPREADSHEET_FILE_MIME_TYPES)
)
