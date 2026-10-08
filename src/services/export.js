const csvCell = (value) => {
  const text = String(value ?? '')
  const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}
export const encodeCsv = (rows) => rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
export function analyticsCsv(report) {
  return encodeCsv([
    ['Type', 'Name', 'Date', 'Completed', 'Pending', 'Total', 'Progress percent', 'Tracked hours', 'Value'],
    ['Period', report.timeZone, `${report.firstDate} to ${report.today}`, '', '', '', '', '', report.days],
    ['Summary', 'Tasks', '', report.completed, report.pending, report.total, '', (report.trackedMilliseconds / 3600000).toFixed(4), ''],
    ['Summary', 'Completions in period', '', report.completedInPeriod], ['Summary', 'Overdue tasks', '', '', report.overdue],
    ...['daily', 'weekly', 'monthly'].flatMap((group) => report[group].map((row) => [group, 'Productivity', row.date, row.completed, '', row.created, '', row.trackedHours.toFixed(4)])),
    ...report.priorities.map((row) => ['Priority', row.name, '', '', '', row.count]),
    ...report.projects.map((row) => ['Project', row.name, '', row.completed, row.pending, row.total, row.progress, (row.trackedMilliseconds / 3600000).toFixed(4)]),
    ...report.workload.map((row) => ['Member', row.name, '', row.completed, row.pending, row.total, row.progress]),
  ])
}
export function downloadCsv(contents, filename) {
  const url = URL.createObjectURL(new Blob(['\ufeff', contents], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
