fn main() {
    if let Err(error) = app_lib::commerce_operator_native::run_credential_setup() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
