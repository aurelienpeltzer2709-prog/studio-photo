const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./site_photos.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS utilisateurs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pseudo TEXT UNIQUE,
    mot_de_passe TEXT,
    role TEXT DEFAULT 'user',
    est_banni INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auteur_id INTEGER,
    nom_fichier TEXT,
    est_prive INTEGER DEFAULT 0,
    FOREIGN KEY(auteur_id) REFERENCES utilisateurs(id)
  )`);
});

module.exports = db;