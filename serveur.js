const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./database');

const app = express();

// Création du dossier d'upload s'il n'existe pas
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuration du stockage de fichiers
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadDir));

// Initialisation des tables SQLite
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS utilisateurs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    mot_de_passe TEXT,
    pseudo TEXT,
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

// Middleware d'authentification
function verifierConnexion(req, res, next) {
  const utilisateurId = req.headers['user-id'];
  if (!utilisateurId) return res.status(401).send('Veuillez vous connecter.');

  db.get('SELECT * FROM utilisateurs WHERE id = ?', [utilisateurId], (err, user) => {
    if (err || !user) return res.status(401).send('Utilisateur introuvable.');
    if (user.est_banni === 1) return res.status(403).send('Compte banni.');
    req.user = user;
    next();
  });
}

// Routes Utilisateurs
app.post('/api/inscription', (req, res) => {
  const { email, mot_de_passe, pseudo } = req.body;
  if (!email || !mot_de_passe) return res.status(400).send('Tous les champs sont requis.');

  const nomUtilisateur = pseudo && pseudo.trim() !== '' ? pseudo : email.split('@')[0];

  db.run(
    'INSERT INTO utilisateurs (email, mot_de_passe, pseudo) VALUES (?, ?, ?)',
    [email.toLowerCase(), mot_de_passe, nomUtilisateur],
    function (err) {
      if (err) return res.status(400).send('Adresse email déjà utilisée.');
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
      if (err || !user) return res.status(400).send('Email ou mot de passe incorrect.');
      res.json({ id: user.id, pseudo: user.pseudo, role: user.role });
    }
  );
});

// Routes Photos
app.post('/api/upload', verifierConnexion, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).send('Aucune photo fournie.');
  const est_prive = req.body.est_prive === 'true' ? 1 : 0;

  db.run(
    'INSERT INTO photos (auteur_id, nom_fichier, est_prive) VALUES (?, ?, ?)',
    [req.user.id, req.file.filename, est_prive],
    (err) => {
      if (err) return res.status(500).send("Erreur lors de l'enregistrement de la photo.");
      res.send('Photo téléversée avec succès.');
    }
  );
});

app.get('/api/photos', verifierConnexion, (req, res) => {
  const isAnon = req.user.role === 'admin';
  const query = isAnon
    ? `SELECT photos.*, utilisateurs.pseudo FROM photos LEFT JOIN utilisateurs ON photos.auteur_id = utilisateurs.id ORDER BY photos.id DESC`
    : `SELECT photos.*, utilisateurs.pseudo FROM photos LEFT JOIN utilisateurs ON photos.auteur_id = utilisateurs.id WHERE photos.est_prive = 0 OR photos.auteur_id = ? ORDER BY photos.id DESC`;

  db.all(query, isAnon ? [] : [req.user.id], (err, rows) => {
    if (err) return res.status(500).send('Erreur lors de la récupération des photos.');
    res.json(rows);
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Configuration du port dynamique requis par les hébergeurs distants
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur prêt sur le port ${PORT}`));