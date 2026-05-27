# Migration Script: Access DB to Firebase
# This script extracts data from the Access database and prepares it for Firebase import

param(
    [string]$AccessDbPath = "..\db.accdb",
    [string]$OutputDir = ".\migration-data"
)

Write-Host "=== Access to Firebase Migration Script ===" -ForegroundColor Cyan
Write-Host "Access DB: $AccessDbPath" -ForegroundColor Yellow
Write-Host "Output Directory: $OutputDir" -ForegroundColor Yellow

# Create output directory
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
    Write-Host "Created output directory: $OutputDir" -ForegroundColor Green
}

# Check if Access DB exists
if (-not (Test-Path $AccessDbPath)) {
    Write-Host "ERROR: Access database not found at $AccessDbPath" -ForegroundColor Red
    exit 1
}

# Connection string for Access database
$connectionString = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$AccessDbPath;"

try {
    # Create connection
    $connection = New-Object System.Data.OleDb.OleDbConnection($connectionString)
    $connection.Open()
    Write-Host "Connected to Access database successfully!" -ForegroundColor Green

    # Tables to extract
    $tables = @(
        @{Name="Items"; Collection="products"; IdField="ItemID"},
        @{Name="Customers"; Collection="customers"; IdField="CustomerID"},
        @{Name="Receipts"; Collection="sales"; IdField="ReceiptID"},
        @{Name="Supplier"; Collection="suppliers"; IdField="SupplierID"},
        @{Name="Purchased"; Collection="purchases"; IdField="PurchasedID"},
        @{Name="Users"; Collection="users"; IdField="UserID"}
    )

    foreach ($table in $tables) {
        Write-Host "`nExtracting $($table.Name)..." -ForegroundColor Cyan
        
        $query = "SELECT * FROM [$($table.Name)]"
        $command = New-Object System.Data.OleDb.OleDbCommand($query, $connection)
        $adapter = New-Object System.Data.OleDb.OleDbDataAdapter($command)
        $dataTable = New-Object System.Data.DataTable
        $adapter.Fill($dataTable) | Out-Null

        Write-Host "  Found $($dataTable.Rows.Count) records" -ForegroundColor Yellow

        # Convert to JSON-friendly format
        $records = @()
        foreach ($row in $dataTable.Rows) {
            $record = @{}
            foreach ($column in $dataTable.Columns) {
                $value = $row[$column.ColumnName]
                
                # Handle NULL values
                if ($value -is [System.DBNull]) {
                    $value = $null
                }
                # Convert TEXT to numbers where appropriate
                elseif ($value -is [string] -and $value -match '^\d+\.?\d*$') {
                    $value = [decimal]$value
                }
                
                $record[$column.ColumnName] = $value
            }
            $records += $record
        }

        # Save to JSON file
        $outputFile = Join-Path $OutputDir "$($table.Collection).json"
        $records | ConvertTo-Json -Depth 10 | Set-Content $outputFile -Encoding UTF8
        Write-Host "  Saved to $outputFile" -ForegroundColor Green
    }

    $connection.Close()
    Write-Host "`n=== Migration Complete ===" -ForegroundColor Green
    Write-Host "Data exported to: $OutputDir" -ForegroundColor Yellow
    Write-Host "`nNext steps:" -ForegroundColor Cyan
    Write-Host "1. Review the JSON files in $OutputDir" -ForegroundColor White
    Write-Host "2. Run the Firebase import script to upload data" -ForegroundColor White

} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    if ($connection.State -eq 'Open') {
        $connection.Close()
    }
    exit 1
}
