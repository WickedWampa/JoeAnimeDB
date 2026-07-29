/*
Settings / Workshop layout sketch

Replace the existing action row with three maintenance cards.

<MaintenanceCard title="📚 Library">
  <Button>Export Backup</Button>
  <Button>Export Library List</Button>
  <Button>Export Ranked List</Button>
  <Button>Export CSV</Button>
  <Button variant="primary">Import Library List</Button>
</MaintenanceCard>

<MaintenanceCard title="🧬 Database">
  <Button>Update Database + Genomes</Button>
  <Button>Open Integrity Scan</Button>
  <Button>Clean Metadata</Button>
</MaintenanceCard>

<MaintenanceCard title="⚙️ System">
  <Button>Open Data Folder</Button>
  <Button>View Logs</Button>
  <Button variant="danger">Reset Local Data</Button>
</MaintenanceCard>
*/

export const workshopCards = [
  {
    title: "📚 Library",
    actions: [
      "Export Backup",
      "Export Library List",
      "Export Ranked List",
      "Export CSV",
      "Import Library List"
    ]
  },
  {
    title: "🧬 Database",
    actions: [
      "Update Database + Genomes",
      "Open Integrity Scan",
      "Clean Metadata"
    ]
  },
  {
    title: "⚙️ System",
    actions: [
      "Open Data Folder",
      "View Logs",
      "Reset Local Data"
    ]
  }
];
