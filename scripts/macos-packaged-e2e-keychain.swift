import Foundation
import Security

private let service = "com.nebutra.cutout"

private func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data("\(message)\n".utf8))
  exit(1)
}

private func validProviderId(_ value: String) -> Bool {
  guard !value.isEmpty, value.utf8.count <= 120 else { return false }
  let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._:-")
  guard value.unicodeScalars.allSatisfy(allowed.contains) else { return false }
  return value.first?.isLetter == true || value.first?.isNumber == true
}

private func signedTeamId(for binary: String) -> String {
  let process = Process()
  let output = Pipe()
  process.executableURL = URL(fileURLWithPath: "/usr/bin/codesign")
  process.arguments = ["-dv", "--verbose=4", binary]
  process.standardOutput = FileHandle.nullDevice
  process.standardError = output
  do { try process.run() } catch { fail("The packaged E2E signature could not be inspected.") }
  process.waitUntilExit()
  guard process.terminationStatus == 0,
        let text = String(data: output.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8),
        let row = text.split(separator: "\n").first(where: { $0.hasPrefix("TeamIdentifier=") }) else {
    fail("The packaged E2E signature has no Team identifier.")
  }
  let teamId = row.dropFirst("TeamIdentifier=".count)
  let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
  guard teamId.count == 10, teamId.unicodeScalars.allSatisfy(allowed.contains) else {
    fail("The packaged E2E Team identifier is invalid.")
  }
  return String(teamId)
}

private func setPartitionList(
  teamId: String,
  account: String,
  keychainPassword: Data
) {
  let process = Process()
  let input = Pipe()
  process.executableURL = URL(fileURLWithPath: "/usr/bin/security")
  process.arguments = [
    "set-generic-password-partition-list",
    "-s", service,
    "-a", account,
    "-S", "apple-tool:,apple:,teamid:\(teamId)",
  ]
  process.standardInput = input
  process.standardOutput = FileHandle.nullDevice
  process.standardError = FileHandle.nullDevice
  do { try process.run() } catch { fail("The packaged E2E Keychain partition could not be updated.") }
  input.fileHandleForWriting.write(keychainPassword)
  input.fileHandleForWriting.write(Data([0x0A]))
  input.fileHandleForWriting.closeFile()
  process.waitUntilExit()
  guard process.terminationStatus == 0 else {
    fail("The packaged E2E Keychain partition update failed.")
  }
}

guard CommandLine.arguments.count == 4 else {
  fail("Usage: keychain-helper <provision|delete> <provider-id> <trusted-binary>")
}
let action = CommandLine.arguments[1]
let providerId = CommandLine.arguments[2]
let trustedBinary = CommandLine.arguments[3]
guard action == "provision" || action == "delete", validProviderId(providerId) else {
  fail("Invalid packaged E2E Keychain request.")
}
guard trustedBinary.hasPrefix("/private/tmp/cutout-e2e-"),
      trustedBinary.contains("/bundle/Cutout.app/Contents/MacOS/"),
      ["app", "Cutout"].contains(URL(fileURLWithPath: trustedBinary).lastPathComponent),
      FileManager.default.isExecutableFile(atPath: trustedBinary) else {
  fail("The trusted packaged E2E binary is unavailable.")
}

let account = "provider:\(providerId)"
let match: [CFString: Any] = [
  kSecClass: kSecClassGenericPassword,
  kSecAttrService: service,
  kSecAttrAccount: account,
]

let payload = FileHandle.standardInput.readDataToEndOfFile()
guard let separator = payload.firstIndex(of: 0x0A) else {
  fail("The Keychain helper input frame is invalid.")
}
var keychainPassword = Data(payload[..<separator])
if keychainPassword.last == 0x0D { keychainPassword.removeLast() }
guard !keychainPassword.isEmpty, keychainPassword.count <= 1024 else {
  fail("The test Keychain password frame is invalid.")
}
var keychain: SecKeychain?
guard SecKeychainCopyDefault(&keychain) == errSecSuccess, let keychain else {
  fail("The default test Keychain is unavailable.")
}
let unlockStatus = keychainPassword.withUnsafeBytes { bytes in
  SecKeychainUnlock(keychain, UInt32(bytes.count), bytes.baseAddress, true)
}
guard unlockStatus == errSecSuccess else {
  fail("The default test Keychain could not be unlocked (\(unlockStatus)).")
}

if action == "delete" {
  let status = SecItemDelete(match as CFDictionary)
  guard status == errSecSuccess || status == errSecItemNotFound else {
    fail("Remote Keychain deletion failed (\(status)).")
  }
  exit(0)
}

var secret = Data(payload[payload.index(after: separator)...])
while secret.last == 0x0A || secret.last == 0x0D {
  secret.removeLast()
}
guard !secret.isEmpty, secret.count <= 64 * 1024,
      secret.allSatisfy({ $0 >= 0x20 && $0 != 0x7F }) else {
  fail("The streamed Provider credential is empty or oversized.")
}

var trustedApplication: SecTrustedApplication?
guard SecTrustedApplicationCreateFromPath(trustedBinary, &trustedApplication) == errSecSuccess,
      let trustedApplication else {
  fail("The packaged E2E binary could not be bound to a Keychain ACL.")
}
var access: SecAccess?
let accessStatus = SecAccessCreate(
  "Cutout packaged E2E Provider credential" as CFString,
  [trustedApplication] as CFArray,
  &access
)
guard accessStatus == errSecSuccess, let access else {
  fail("The packaged E2E Keychain ACL could not be created.")
}

let deleteStatus = SecItemDelete(match as CFDictionary)
guard deleteStatus == errSecSuccess || deleteStatus == errSecItemNotFound else {
  fail("The prior remote Keychain item could not be replaced (\(deleteStatus)).")
}
var item = match
item[kSecValueData] = secret
item[kSecAttrAccess] = access
let addStatus = SecItemAdd(item as CFDictionary, nil)
guard addStatus == errSecSuccess else {
  fail("Remote Keychain provisioning failed (\(addStatus)).")
}
setPartitionList(
  teamId: signedTeamId(for: trustedBinary),
  account: account,
  keychainPassword: keychainPassword
)
