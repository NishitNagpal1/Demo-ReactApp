import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('twinmind.db');

export function initDB() {
  db.withTransactionSync(() => {
    db.execSync(
      `CREATE TABLE IF NOT EXISTS transcripts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );`
    );
  });
}

export function saveTranscript(content: string) {
  db.withTransactionSync(() => {
    db.execSync(
      `INSERT INTO transcripts (content) VALUES ('${content.replace(/'/g, "''")}');`
    );
  });
}

export function getTranscripts(callback: (rows: any[]) => void) {
  db.withTransactionSync(() => {
    const rows = db.getAllSync(
      'SELECT * FROM transcripts ORDER BY created_at DESC;'
    );
    callback(rows);
  });
}