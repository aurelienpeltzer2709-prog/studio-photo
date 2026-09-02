const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./database');

const app = express();

// Configuration du dossier temporaire de téléchargement
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadDir));

// Initialisation de la base SQLite
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS utilisateurs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    mot_de_passe TEXT,
    pseudo TEXT,
    code_verification TEXT,
    est_verifie INTEGER DEFAULT 1,
    role TEXT DEFAULT 'user',
    est_banni INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auteur_id INTEGER,
    nom_fichier TEXT,
    est_prive INTEGER DEFAULT 0
  )`);
});

function verifierConnexion(req, res, next) {
  const utilisateurId = req.headers['user-id'];
  if (!utilisateurId) return res.status(401).send('Veuillez vous connecter.');

  db.get('SELECT * FROM utilisateurs WHERE id = ?', [utilisateurId], (err, user) => {
    if (!user) return res.status(401).send('Utilisateur introuvable.');
    if (user.est_banni === 1) return res.status(403).send('Compte banni.');
    req.user = user;
    next();
  });
}

// Routes API
app.post('/api/inscription', (req, res) => {
  const { email, mot_de_passe, pseudo } = req.body;
  if (!email || !mot_de_passe) return res.status(400).send('Champs requis manquant.');

  const nomUtilisateur = pseudo && pseudo.trim() !== '' ? pseudo : email.split('@')[0];

  db.run(
    'INSERT INTO utilisateurs (email, mot_de_passe, pseudo, est_verifie) VALUES (?, ?, ?, 1)',
    [email.toLowerCase(), mot_de_passe, nomUtilisateur],
    function (err) {
      if (err) return res.status(400).send('Cet e-mail est deja utilise.');
      res.json({ id: this.lastID, pseudo: nomUtilisateur });
    }
  );
});

app.post('/api/connexion', (req, res) => {
  const { email, mot_de_passe } = req.body;
  db.get(
    'SELECT * FROM utilisateurs WHERE LOWER(email) = ? AND mot_de_passe = ?',
    [email.toLowerCase(), mot_de_passe],
    (err, user) => {
      if (err || !user) return res.status(400).send('Identifiants incorrects.');
      res.json({ id: user.id, pseudo: user.pseudo, role: user.role });
    }
  );
});

app.post('/api/upload', verifierConnexion, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).send('Aucun fichier.');
  const est_prive = req.body.est_prive === 'true' ? 1 : 0;
  
  db.run(
    'INSERT INTO photos (auteur_id, nom_fichier, est_prive) VALUES (?, ?, ?)',
    [req.user.id, req.file.filename, est_prive],
    (err) => {
      if (err) return res.status(500).send('Erreur d enregistrement.');
      res.send('Photo ajoutee.');
    }
  );
});

app.get('/api/photos', verifierConnexion, (req, res) => {
  const query = req.user.role === 'admin'
    ? `SELECT photos.*, utilisateurs.pseudo FROM photos LEFT JOIN utilisateurs ON photos.auteur_id = utilisateurs.id ORDER BY photos.id DESC`
    : `SELECT photos.*, utilisateurs.pseudo FROM photos LEFT JOIN utilisateurs ON photos.auteur_id = utilisateurs.id WHERE photos.est_prive = 0 OR photos.auteur_id = ? ORDER BY photos.id DESC`;

  db.all(query, req.user.role === 'admin' ? [] : [req.user.id], (err, rows) => {
    if (err) return res.status(500).send('Erreur.');
    res.json(rows);
  });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Ecoute sur le port dynamique fourni par l'hebergeur cloud
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur actif sur le port ${PORT}`));