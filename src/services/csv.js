export function parseCSV(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  const input = text.replace(/^\uFEFF/, '')
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]
    if (character === '"' && quoted && input[index + 1] === '"') {
      field += '"'
      index += 1
    } else if (character === '"') {
      quoted = !quoted
    } else if (character === ',' && !quoted) {
      row.push(field.trim())
      field = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && input[index + 1] === '\n') index += 1
      row.push(field.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []
      field = ''
    } else {
      field += character
    }
  }
  if (quoted) throw new Error('The CSV file contains an unclosed quoted field.')
  row.push(field.trim())
  if (row.some(Boolean)) rows.push(row)
  if (rows.length < 2) throw new Error('The CSV file needs a header and at least one data row.')
  const headers = rows[0].map((header) => header.toLowerCase().replace(/[\s_-]+/g, ''))
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])))
}

