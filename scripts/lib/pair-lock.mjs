import fs from 'node:fs';
import path from 'node:path';

export function acquirePairLock(base, session) {
    const lock = path.join(base, `.${session}.pair.lock`);
    let fd;
    try { fd = fs.openSync(lock, 'wx'); }
    catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const owner = JSON.parse(fs.readFileSync(lock, 'utf-8'));
        if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) throw new Error('Invalid pairing lock; inspect it before retrying.');
        let alive = true;
        try { process.kill(owner.pid, 0); } catch (probe) { if (probe.code === 'ESRCH') alive = false; }
        if (alive) throw new Error(`Another pairing process is active for ${session} (PID ${owner.pid}).`);
        fs.unlinkSync(lock);
        fd = fs.openSync(lock, 'wx');
    }
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid }));
    return () => { fs.closeSync(fd); fs.unlinkSync(lock); };
}
