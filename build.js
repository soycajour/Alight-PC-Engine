const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const CORE_DIR = path.join(__dirname, 'alight-pc-core');
const UI_DIR = path.join(__dirname, 'alight-pc-ui');

function buildNativeCore() {
    console.log('--- Building Native Core (Rust) ---');
    try {
        // We use the absolute path to cargo if possible
        const cargoPath = path.join(process.env.USERPROFILE, '.cargo', 'bin', 'cargo.exe');
        const cmd = fs.existsSync(cargoPath) ? `"${cargoPath}"` : 'cargo';
        
        execSync(`${cmd} build --release`, {
            cwd: CORE_DIR,
            stdio: 'inherit'
        });
        
        // Find the generated .node or .dll file
        // NAPI-RS usually outputs to target/release/
        const binaryName = 'alight_pc_core.dll'; // Windows
        const sourcePath = path.join(CORE_DIR, 'target', 'release', binaryName);
        const destPath = path.join(UI_DIR, 'native', 'alight-core.node');
        
        if (!fs.existsSync(path.dirname(destPath))) {
            fs.mkdirSync(path.dirname(destPath), { recursive: true });
        }
        
        if (fs.existsSync(sourcePath)) {
            fs.copyFileSync(sourcePath, destPath);
            console.log('>>> Native core built and linked successfully.');
        } else {
            console.error('!!! Build finished but binary not found at', sourcePath);
        }
    } catch (err) {
        console.error('!!! Failed to build native core:', err.message);
    }
}

function startUI() {
    console.log('--- Starting UI (Electron) ---');
    execSync('npm run dev', {
        cwd: UI_DIR,
        stdio: 'inherit'
    });
}

// Master Execution Flow
buildNativeCore();
// startUI(); // Uncomment to auto-start UI
