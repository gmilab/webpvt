
const fs = require('fs');
const YAML = require('yaml');
const config = YAML.parse(fs.readFileSync('../data/config.yaml', 'utf8'));

const express = require('express');
const asyncrouter = require('express-async-router').AsyncRouter;
const db = require('better-sqlite3')('../data/' + config.dbpath);
const crypto = require('node:crypto');
const Papa = require('papaparse');

const dbs = {
    insert_sessions: db.prepare('INSERT INTO sessions (token, subject_id, date) VALUES (:token, :subject_id, :date)'),
    find_sessions: db.prepare('SELECT COUNT(*) AS N FROM sessions WHERE token = :token AND session_id = :session_id'),
    select_session: db.prepare('SELECT * FROM sessions WHERE session_id = :session_id'),
    insert_actions: db.prepare('INSERT INTO actions (session_id, time, action) VALUES (:session_id, :time, :action)'),
    get_all_actions: db.prepare('SELECT * FROM actions WHERE session_id = :session_id'),
};

const formData = require('form-data');
const Mailgun = require('mailgun.js');
const mailgun = new Mailgun(formData);
const mg = mailgun.client({ username: 'api', key: config.mailgun.api_key });

const app = express();
if (process.env.NODE_ENV !== 'production') {
    // add morganbody for debugging
    const morganbody = require('morgan-body');
    morganbody(app, {
        skip: (req, res) => !req.originalUrl.startsWith('/api'),
    });
}

const router = asyncrouter();

router.use(express.json());

router.get('/heartbeat', async (req, res) => {
    res.send('OK');
});

router.post('/start', async (req, res) => {
    const buf = crypto.randomBytes(16);
    const token = buf.toString('base64').replace(/[^a-zA-Z0-9]/g, '');
    const subject_id = ('' + req.body.subject_id).replace(/[^a-zA-Z0-9]/g, '');
    const date = new Date().toISOString();

    const rslt = dbs.insert_sessions.run({ token, subject_id, date });

    res.json({ success: true, token, session_id: rslt.lastInsertRowid });
});

router.post('/action', async (req, res) => {

    // check token
    const token = ('' + req.body.token).replace(/[^a-zA-Z0-9]/g, '');
    const session_id = parseInt(req.body.session_id, 10);
    const rslt = dbs.find_sessions.get({ token, session_id });
    if (rslt.N !== 1) {
        res.status(403).json({ success: false, error: 'Invalid token' });
        return;
    }

    const time = parseFloat(req.body.time);;
    const action = ('' + req.body.action).replace(/[^a-zA-Z0-9]/g, '');
    dbs.insert_actions.run({ session_id, time, action });

    res.json({ success: true });
});

router.post('/end', async (req, res) => {
    // check token
    const token = ('' + req.body.token).replace(/[^a-zA-Z0-9]/g, '');
    const session_id = parseInt(req.body.session_id, 10);
    const rslt = dbs.find_sessions.get({ token, session_id });
    if (rslt.N !== 1) {
        res.status(403).json({ success: false, error: 'Invalid token' });
        return;
    }
    res.json({ success: true });

    const session = dbs.select_session.get({ session_id });

    // get all actions from this session
    const actions = dbs.get_all_actions.all({ session_id });

    // export actions as CSV
    const csv = Papa.unparse(actions);

    // send email
    const data = {
        from: 'Ibrahim Lab WebPVT <' + config.mailgun.from + '>',
        to: config.mailgun.to,
        subject: 'PVT for ' + session.subject_id + ' (' + session.date + ')',
        text: 'Experiment data attached for subject ' + session.subject_id + ' on ' + session.date + '.',
        attachment: { data: csv, filename: session.subject_id + '_' + session.date + '_actions.csv' },
    };
    mg.messages.create(config.mailgun.domain, data).then(msg => console.log(msg)).catch(err => console.log(err));
});


app.use('/api', router);
app.use('/', express.static('../frontend'));
app.listen(config.port, () => console.log('Listening on port ' + config.port + '!'));
