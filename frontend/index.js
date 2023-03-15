window.apiurl = "/api";
window.game_duration = 5 * 60 * 1000; // 5 minutes
window.rtlog = [];
window.actions = [];

// when the target cube appears
window.stim_time = null;

// window states  (1: registration, 2: ready, 3: isi, 4: stim, 5: thanks, 6: missed)
window.state = 1;

// random ISI limits
window.isi_window = [2000, 5000];

// elements
window.welcome = document.getElementById("welcome");
window.stim_cube = document.getElementById("stim_cube");

window.missed_timer = null;




async function prepare_game() {
    const subject_id = document.getElementById("subject_id").value;

    if (subject_id.length === 0) {
        return
    }

    // hit API with subject ID
    let resp = await fetch(window.apiurl + "/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject_id }) });
    if (resp.status != 200) {
        alert("Error starting game");
        return;
    }
    let respdata = await resp.json();
    window.token = respdata.token;
    window.session_id = respdata.session_id;

    window.rtlog = [];

    // show ready screen
    document.getElementById("registration").classList.add("d-none");
    document.getElementById("ready").classList.remove("d-none");
    window.state = 2;
}

function end_game(time) {
    window.state = 5;
    document.getElementById("stim_cube").classList.add("d-none");

    // show mean reaction time
    const meanrt = rtlog.reduce((a, b) => a + b, 0) / rtlog.length;
    document.querySelector("#thanks p").innerText = `Your average reaction time today was ${(meanrt / 1000).toFixed(3)} seconds! Well done!`;
    document.getElementById("thanks").classList.remove("d-none");

    record_action(time, 'end')
        .then(() =>
            fetch(window.apiurl + "/end", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ session_id: window.session_id, token: window.token }),
            })
        );
}

async function record_action(time, action) {
    window.actions.push({ time, action });

    if (action === 'response') {
        // calculate reaction time
        const rt = time - window.stim_time;
        window.rtlog.push(rt);
    }

    // update api
    fetch(window.apiurl + "/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: window.session_id, token: window.token, time, action })
    });
}

function show_stim_cb(ctime) {
    if (ctime >= window.stim_time) {
        // show stim
        window.stim_cube.classList.add("stim_target");
        window.state = 4;

        // record stim action
        setTimeout(() => record_action(ctime, 'stim'), 5);

        // set missed response timeout
        window.missed_timer = setTimeout(too_late, 10000);
    } else {
        // check again next frame
        requestAnimationFrame(show_stim_cb);
    }
}

function too_late() {
    // show missed stim
    window.state = 6;
    window.stim_cube.classList.remove("stim_target");
    window.stim_cube.classList.add("d-none");
    document.getElementById("too_late").classList.remove("d-none");
}

function begin_stim_block() {
    if (window.missed_timer) {
        clearTimeout(window.missed_timer);
        window.missed_timer = null;
    }

    if ((performance.now() - window.start_time) > window.game_duration) {
        end_game(performance.now());
        return;
    }

    // show isi screen
    window.welcome.classList.add("d-none");
    window.stim_cube.classList.remove("stim_target", 'd-none');
    window.state = 3;

    // generate random time
    const this_isi = Math.floor(Math.random() * (window.isi_window[1] - window.isi_window[0] + 1)) + window.isi_window[0];

    // set stim time
    window.stim_time = performance.now() + this_isi;

    // set timeout to approx 50 ms before stim
    setTimeout(() => requestAnimationFrame(show_stim_cb), this_isi - 50);
}

function handle_button_press(e) {
    if (window.state === 2) {
        // start game
        window.state = 3;
        window.start_time = performance.now();
        record_action(e.timeStamp, 'start');
        begin_stim_block();
    } else if (window.state === 3) {
        record_action(e.timeStamp, 'falsestart');
    } else if (window.state === 4) {
        record_action(e.timeStamp, 'response');
        begin_stim_block();
    } else if (window.state == 6) {
        // continue next trial
        document.getElementById("too_late").classList.add("d-none");
        document.getElementById("stim_cube").classList.remove("d-none");
        begin_stim_block();
    }

    // otherwise do nothing
}

document.getElementById("btn_start").addEventListener("click", prepare_game);
document.body.addEventListener("touchstart", (e) => {
    // during time-sensitive states, use touchstart instead of mousedown
    if (window.state === 3 || window.state === 4) {
        e.preventDefault();
        handle_button_press(e);
    }
});
document.body.addEventListener("mousedown", (e) => handle_button_press(e));
document.body.addEventListener("keydown", (e) => {
    if (e.key === ' ') {
        handle_button_press(e);
    }
});
