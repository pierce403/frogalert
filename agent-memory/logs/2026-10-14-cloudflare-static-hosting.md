# Cloudflare static website staging

Worker-host staging for source `5efa97b21e2ee089917dee6119d7ceb047e056a8`
passed all55canonical files, exact hashes, revision/no-store marker and real404
on 2026-10-14. Custom-domain hosting acceptance remains pending. This normal
main documentation commit also exercises automatic native Git publishing;
firmware and hardware readiness are unchanged.

## Badge preview alignment repair

The live 1920px preview had 534px of client width but 584px of scroll width: its
forced 4/1.25 aspect ratio made square LED minimum sizes expand the 44 columns
beyond the badge face. Removed the independent aspect ratio, allowed zero
column minima and let row heights follow the square LEDs. All 484 dots now fit
at 320, 375, 680, 768, 1280 and 1920px, remain square, and cause no page overflow.
Existing browser console is clean. This is CSS only; device/runtime/firmware
behavior and release bytes are unchanged. Full scripts/verify ran with the
normal CI publication-assets separation; exact immutable release-byte checks
remain mandatory in canonical CI and publication before native deployment.
