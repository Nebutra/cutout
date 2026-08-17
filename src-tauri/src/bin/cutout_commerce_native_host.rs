fn main() {
    if app_lib::commerce_operator_native::run().is_err() {
        std::process::exit(1);
    }
}
