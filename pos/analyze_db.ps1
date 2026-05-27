$logFile = "C:\Users\Administrator\Desktop\Ganewa DB\db_schema_success.txt"

function Log-Message {
    param($Message)
    $Message | Out-File -FilePath $logFile -Append -Encoding UTF8
    Write-Host $Message
}

if (Test-Path $logFile) { Remove-Item $logFile }

$path = "C:\Users\Administrator\Desktop\Ganewa DB\db.accdb"
$provider = "Microsoft.ACE.OLEDB.12.0"
$connString = "Provider=$provider;Data Source=$path;Persist Security Info=False;"

try {
    $conn = New-Object System.Data.OleDb.OleDbConnection($connString)
    $conn.Open()
    Log-Message "Connected to database."
    
    $tables = $conn.GetSchema("Tables")
    
    # Try to get all columns
    $allColumns = $conn.GetSchema("Columns")
    
    foreach ($row in $tables.Rows) {
        $tableName = $row["TABLE_NAME"]
        $tableType = $row["TABLE_TYPE"]

        if ($tableType -eq "TABLE" -and $tableName -notlike "MSys*") {
            Log-Message "`nTable: $tableName"
            Log-Message "--------------------"

            # Filter columns for this table
            # Note: Access table names with spaces might need handling, but OLEDB usually returns clean names in TABLE_NAME
            # escaping for .Select() filter might be needed if table name has single quotes
            $safeTableName = $tableName -replace "'", "''"
            $filter = "TABLE_NAME = '$safeTableName'"
            
            if ($allColumns.Columns.Contains("ORDINAL_POSITION")) {
                $tableCols = $allColumns.Select($filter, "ORDINAL_POSITION ASC")
            } else {
                $tableCols = $allColumns.Select($filter)
            }
            
            foreach ($col in $tableCols) {
                $colName = $col["COLUMN_NAME"]
                # OLEDB Data Type is an integer (OleDbType enum). 
                # We can print the integer, or try to map it, but the int is better than nothing.
                $dataType = $col["DATA_TYPE"] 
                Log-Message "  - $colName (TypeEnum: $dataType)"
            }
        }
    }
    
    $conn.Close()
}
catch {
    Log-Message "Error: $($_.Exception.Message)"
}