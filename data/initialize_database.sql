CREATE TABLE sessions (
	session_id INTEGER PRIMARY KEY AUTOINCREMENT,
	token TEXT,
	subject_id TEXT
, date TEXT);

CREATE TABLE actions (
	action_id INTEGER PRIMARY KEY AUTOINCREMENT,
	session_id INTEGER,
	time REAL,
	"action" TEXT,
	CONSTRAINT actions_FK FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON UPDATE CASCADE
);
