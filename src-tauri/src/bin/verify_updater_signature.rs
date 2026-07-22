use base64::{engine::general_purpose::STANDARD, Engine as _};
use minisign_verify::{PublicKey, Signature};
use std::{
    env,
    fs::File,
    io::{BufReader, Read},
    path::Path,
    process::ExitCode,
};

const BUFFER_SIZE: usize = 1024 * 1024;

fn decode_public_key(value: &str) -> Result<PublicKey, String> {
    let normalized = value.replace("\r\n", "\n");
    let normalized = normalized.trim();
    if normalized.contains('\n') {
        return PublicKey::decode(normalized)
            .map_err(|error| format!("Invalid CUTOUT_UPDATER_PUBKEY: {error}"));
    }
    if let Ok(key) = PublicKey::from_base64(normalized) {
        return Ok(key);
    }
    let decoded = STANDARD.decode(normalized).map_err(|_| {
        "CUTOUT_UPDATER_PUBKEY is neither a minisign key nor base64 text".to_string()
    })?;
    let decoded = std::str::from_utf8(&decoded)
        .map_err(|_| "Base64 CUTOUT_UPDATER_PUBKEY is not UTF-8".to_string())?;
    PublicKey::decode(decoded.trim())
        .map_err(|error| format!("Invalid decoded CUTOUT_UPDATER_PUBKEY: {error}"))
}

fn decode_signature(value: &str) -> Result<Signature, String> {
    let decoded = STANDARD
        .decode(value.trim())
        .map_err(|_| "Updater signature sidecar is not valid base64".to_string())?;
    let decoded = std::str::from_utf8(&decoded)
        .map_err(|_| "Decoded updater signature is not UTF-8".to_string())?;
    Signature::decode(decoded).map_err(|error| format!("Invalid updater signature: {error}"))
}

fn verify_reader<R: Read>(
    public_key: &PublicKey,
    signature: &Signature,
    mut reader: R,
) -> Result<(), String> {
    let mut verifier = public_key
        .verify_stream(signature)
        .map_err(|error| format!("Updater signature cannot be streamed: {error}"))?;
    let mut buffer = vec![0; BUFFER_SIZE];
    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|error| format!("Could not read updater artifact: {error}"))?;
        if read == 0 {
            break;
        }
        verifier.update(&buffer[..read]);
    }
    verifier
        .finalize()
        .map_err(|error| format!("Updater signature verification failed: {error}"))
}

fn verify_files(artifact_path: &Path, signature_path: &Path) -> Result<(), String> {
    let public_key = env::var("CUTOUT_UPDATER_PUBKEY")
        .map_err(|_| "CUTOUT_UPDATER_PUBKEY is required".to_string())?;
    let public_key = decode_public_key(&public_key)?;
    let signature = std::fs::read_to_string(signature_path)
        .map_err(|error| format!("Could not read updater signature sidecar: {error}"))?;
    let signature = decode_signature(&signature)?;
    let artifact = File::open(artifact_path)
        .map_err(|error| format!("Could not open updater artifact: {error}"))?;
    verify_reader(&public_key, &signature, BufReader::new(artifact))
}

fn run() -> Result<(), String> {
    let mut args = env::args_os().skip(1);
    let artifact = args
        .next()
        .ok_or_else(|| "Usage: verify-updater-signature <artifact> <signature>".to_string())?;
    let signature = args
        .next()
        .ok_or_else(|| "Usage: verify-updater-signature <artifact> <signature>".to_string())?;
    if args.next().is_some() {
        return Err("Usage: verify-updater-signature <artifact> <signature>".to_string());
    }
    verify_files(Path::new(&artifact), Path::new(&signature))?;
    println!(
        "Verified updater signature for {}.",
        Path::new(&artifact).display()
    );
    Ok(())
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    const PUBLIC_KEY: &str = "untrusted comment: minisign public key E7620F1842B4E81F\nRWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3";
    const SIGNATURE: &str = "untrusted comment: signature from minisign secret key\nRUQf6LRCGA9i559r3g7V1qNyJDApGip8MfqcadIgT9CuhV3EMhHoN1mGTkUidF/z7SrlQgXdy8ofjb7bNJJylDOocrCo8KLzZwo=\ntrusted comment: timestamp:1556193335\tfile:test\ny/rUw2y8/hOUYjZU71eHp/Wo1KZ40fGy2VJEDl34XMJM+TX48Ss/17u3IvIfbVR1FkZZSNCisQbuQY+bHwhEBg==";

    #[test]
    fn verifies_the_tauri_minisign_envelope() {
        let public_key = decode_public_key(PUBLIC_KEY).unwrap();
        let signature = decode_signature(&STANDARD.encode(SIGNATURE)).unwrap();
        verify_reader(&public_key, &signature, Cursor::new(b"test")).unwrap();
    }

    #[test]
    fn rejects_tampered_artifact_bytes() {
        let public_key = decode_public_key(PUBLIC_KEY).unwrap();
        let signature = decode_signature(&STANDARD.encode(SIGNATURE)).unwrap();
        let error = verify_reader(&public_key, &signature, Cursor::new(b"Test")).unwrap_err();
        assert!(error.contains("verification failed"));
    }

    #[test]
    fn accepts_base64_encoded_public_key_text() {
        let encoded = STANDARD.encode(PUBLIC_KEY);
        assert!(decode_public_key(&encoded).is_ok());
    }
}
