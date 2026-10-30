use std::process::Command;

#[test]
fn help_describes_the_fixed_demo_without_running_it() {
    let output = Command::new(env!("CARGO_BIN_EXE_moovn-engine-cli"))
        .arg("--help")
        .output()
        .expect("run engine demo help");
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).expect("UTF-8 help");
    assert!(stdout.contains("does not load .mpvn/.msvn"));
    assert!(stdout.contains("compile host languages"));
    assert!(!stdout.contains("[MooVN Engine::"));
}

#[test]
fn unknown_arguments_fail_and_demo_is_labelled_as_an_example() {
    let unsupported = Command::new(env!("CARGO_BIN_EXE_moovn-engine-cli"))
        .arg("story.mpvn")
        .output()
        .expect("run engine demo with unsupported project");
    assert!(!unsupported.status.success());
    assert!(String::from_utf8(unsupported.stderr).unwrap().contains("Unsupported argument"));
    let demo = Command::new(env!("CARGO_BIN_EXE_moovn-engine-cli"))
        .output()
        .expect("run fixed demo");
    assert!(demo.status.success());
    let stdout = String::from_utf8(demo.stdout).unwrap();
    assert!(stdout.contains("fixed in-memory example"));
    assert!(stdout.contains("not a host-language compiler"));
    assert!(!stdout.contains("Transpiled to"));
}
