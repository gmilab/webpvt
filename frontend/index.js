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

// gamepad
window.current_gamepad = null;
window.gamepad_timer = null;

// serial
window.serialiface = null;
window.serialwriter = null;
window.serial_testseq_index = null;

window.trig_vals = {
    'stim': new Uint8Array([2 ** 0]),
    'response': new Uint8Array([2 ** 1]),
    'falsestart': new Uint8Array([2 ** 2]),
    'missed': new Uint8Array([2 ** 3]),
    'end': new Uint8Array([2 ** 4]),
    'start': new Uint8Array([2 ** 5]),
};



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

async function prepare_serial() {
    const port = await navigator.serial
        .requestPort({ filters: [{ usbVendorId: 0x2341 }, { usbVendorId: 0x2a03 }] });
    window.serialiface = port;
    if (!port.writeable) {
        await port.open({ baudRate: 9600 });
    }
    window.serialwriter = port.writable.getWriter();
    console.log("Serial port opened:", port);

    document.getElementById("btn_trig").outerHTML = `<p class="text-success">✓ MMBT Trigger Interface connected</p>
            <button class="btn btn-primary" id="btn_trigtest">Trigger test</button>`;

    write_test_sequence();
    document.getElementById("btn_trigtest").addEventListener("click", write_test_sequence);
}

function write_test_sequence() {
    console.log('writing test sequence: ' + window.serial_testseq_index);
    let cindex;
    if (window.serial_testseq_index === null) {
        window.serial_testseq_index = 0;
    }

    if (window.serial_testseq_index <= 7) {
        cindex = window.serial_testseq_index;
    } else if (window.serial_testseq_index <= 15) {
        cindex = 15 - window.serial_testseq_index;
    } else {
        window.serial_testseq_index = null;
        return;
    }
    window.serialwriter.write(new Uint8Array([Math.pow(2, cindex)]));

    window.serial_testseq_index++;
    setTimeout(write_test_sequence, 100);
}

function end_game(time) {
    window.state = 5;
    document.getElementById("stim_cube").classList.add("d-none");

    if (window.serialwriter) {
        window.serialwriter.write(window.trig_vals['end']);
    }

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
        if (window.serialwriter) {
            window.serialwriter.write(window.trig_vals['stim']);
        }
        setTimeout(() => record_action(ctime, 'stim'), 5);

        if (window.current_gamepad !== null) {
            set_gamepad_timer();
        }

        // set missed response timeout
        window.missed_timer = setTimeout(too_late, 10000);
    } else {
        // check again next frame
        requestAnimationFrame(show_stim_cb);
    }
}

function read_gamepad() {
    const ts = performance.now();

    // check state
    const gp = navigator.getGamepads()[window.current_gamepad];
    if (!gp) {
        stop_gamepad_timer();
        return;
    }

    // check X Y A B LB RB buttons
    for (let ii = 0; ii < 6; ii++) {
        if (gp.buttons[ii].pressed) {
            stop_gamepad_timer();
            handle_button_press({ timeStamp: ts });
            return;
        }
    }
}

function set_gamepad_timer() {
    if (window.gamepad_timer) {
        stop_gamepad_timer();
    }

    window.gamepad_timer = setInterval(read_gamepad, 1);
}

function stop_gamepad_timer() {
    clearInterval(window.gamepad_timer);
    window.gamepad_timer = null;
}

function too_late() {
    // show missed stim
    window.state = 6;
    window.stim_cube.classList.remove("stim_target");
    window.stim_cube.classList.add("d-none");
    document.getElementById("too_late").classList.remove("d-none");
}

function wait_for_gamepad_release() {
    const gp = navigator.getGamepads()[window.current_gamepad];
    if(gp.buttons.some((b) => b.pressed)) {
        if (!window.btnhold_timer) {
            window.btnhold_timer = setTimeout(wait_for_gamepad_release, 100);
            window.btnhold_timeout = performance.now() + 3000;
        } else if (performance.now() > window.btnhold_timeout) {
            // show release button message
            document.getElementById("release_btn").classList.remove("d-none");
            document.getElementById("stim_cube").classList.add("d-none");
        }
    } else {
        // stop the release check timer
        clearTimeout(window.btnhold_timer);
        window.btnhold_timer = null;

        // hide release button message
        document.getElementById("release_btn").classList.add("d-none");
        document.getElementById("stim_cube").classList.remove("d-none");

        // begin the next trial
        begin_stim_block();
    }
}

function begin_stim_block() {
    // check if any buttons are currently pressed. if yes, don't begin yet.
    if (window.current_gamepad !== null) {
        const gp = navigator.getGamepads()[window.current_gamepad];
        for (let ii = 0; ii < gp.buttons.length; ii++) {
            if (gp.buttons[ii].pressed) {
                wait_for_gamepad_release();
                return;
            }
        }
    }


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
        window.start_time = e.timeStamp;

        if (window.serialwriter) {
            window.serialwriter.write(window.trig_vals['start']);
        }

        record_action(e.timeStamp, 'start');
        begin_stim_block();
    } else if (window.state === 3) {
        if (window.serialwriter) {
            window.serialwriter.write(window.trig_vals['falsestart']);
        }
        record_action(e.timeStamp, 'falsestart');

    } else if (window.state === 4) {
        if (window.serialwriter) {
            window.serialwriter.write(window.trig_vals['response']);
        }
        record_action(e.timeStamp, 'response');
        begin_stim_block();

    } else if (window.state == 6) {  // if currently on "too late" screen
        // continue next trial
        document.getElementById("too_late").classList.add("d-none");
        document.getElementById("stim_cube").classList.remove("d-none");
        begin_stim_block();

    }

    // otherwise do nothing
}

// begin events
document.getElementById("btn_start").addEventListener("click", prepare_game);
document.getElementById("btn_trig").addEventListener("click", prepare_serial);
document.getElementById("btn_advanced").addEventListener("click", () => document.getElementById("pn_advanced").classList.toggle("d-none"));

// RT events
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

window.addEventListener("gamepadconnected", (e) => {
    console.log(
        "Gamepad connected at index %d: %s. %d buttons, %d axes.",
        e.gamepad.index,
        e.gamepad.id,
        e.gamepad.buttons.length,
        e.gamepad.axes.length
    );
    let gamepads = navigator.getGamepads().filter((g) => g !== null && String(g.id).toUpperCase().includes('GAMEPAD'));
    window.current_gamepad = gamepads[0].index;

    if (window.state === 2) {
        set_gamepad_timer();
    }

    let status_gamepad = document.getElementById("status_gamepad");
    status_gamepad.innerText = "✓ Gamepad connected";
    status_gamepad.classList.add("text-success");
});
