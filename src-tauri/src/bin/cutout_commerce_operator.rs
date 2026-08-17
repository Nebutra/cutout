fn main() {
    if app_lib::commerce_operator::run().is_err() {
        eprintln!("Commerce operator request failed.");
        std::process::exit(1);
    }
}
