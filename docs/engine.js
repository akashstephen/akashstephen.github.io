/* ==========================================================================
   THE FORGING - Core Engine
   ========================================================================== */

const state = {
    scrollProgress: 0,
    mouse: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    targetMouse: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    acts: [
        { id: 'act-1', progress: 0 },
        { id: 'act-2', progress: 0 },
        { id: 'act-3', progress: 0 },
        { id: 'act-4', progress: 0 },
        { id: 'act-5', progress: 0 }
    ],
    width: window.innerWidth,
    height: window.innerHeight
};

// Canvas Setup
const atmosphereCanvas = document.getElementById('atmosphere');
const atmosphereCtx = atmosphereCanvas.getContext('2d');
const physicsCanvas = document.getElementById('physics-engine');
const physicsCtx = physicsCanvas.getContext('2d');

function resizeCanvases() {
    state.width = window.innerWidth;
    state.height = window.innerHeight;
    const pixelRatio = window.devicePixelRatio || 1;

    [atmosphereCanvas, physicsCanvas].forEach(c => {
        c.width = state.width * pixelRatio;
        c.height = state.height * pixelRatio;
        c.style.width = `${state.width}px`;
        c.style.height = `${state.height}px`;
        c.getContext('2d').scale(pixelRatio, pixelRatio);
    });
}

// Event Listeners
window.addEventListener('resize', resizeCanvases);
window.addEventListener('mousemove', (e) => {
    state.targetMouse.x = e.clientX;
    state.targetMouse.y = e.clientY;
});
window.addEventListener('touchmove', (e) => {
    state.targetMouse.x = e.touches[0].clientX;
    state.targetMouse.y = e.touches[0].clientY;
}, { passive: true });

// Text Fade Observers
function initObservers() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            } else {
                // Optional: remove to let them fade out when scrolling away
                entry.target.classList.remove('visible');
            }
        });
    }, { threshold: 0.2 });

    document.querySelectorAll('.fade').forEach(el => observer.observe(el));
}

// Core Loop
function calculateScrollProgress() {
    // Calculate global and per-act progress
    const windowHeight = window.innerHeight;

    state.acts.forEach((act, index) => {
        const el = document.querySelector(`.act-${index + 1}`);
        if (!el) return;

        const rect = el.getBoundingClientRect();

        // Progress 0 when top enters bottom of screen.
        // Progress 1 when bottom leaves top of screen.
        // This gives us a 0 to 1 value while the element is anywhere in viewport.
        const totalDistance = windowHeight + rect.height;
        let progress = (windowHeight - rect.top) / totalDistance;

        // Clamp between 0 and 1
        progress = Math.max(0, Math.min(1, progress));
        act.progress = progress;
    });
}

function updateMouseEase() {
    // Smooth mouse follow
    state.mouse.x += (state.targetMouse.x - state.mouse.x) * 0.1;
    state.mouse.y += (state.targetMouse.y - state.mouse.y) * 0.1;
}

// --- ACT I & II PHYSICS (The Thread) ---
class PhysicsString {
    constructor(pointsCount, color) {
        this.pointsCount = pointsCount;
        this.points = [];
        this.color = color;
        this.init();
    }

    init() {
        this.points = [];
        const spacing = state.height / (this.pointsCount - 1);
        const startX = state.width / 2;

        for (let i = 0; i < this.pointsCount; i++) {
            this.points.push({
                x: startX,
                y: i * spacing,
                vx: 0,
                baseX: startX
            });
        }
    }

    resize() {
        this.init();
    }

    update(act1Progress, act2Progress) {
        // Tension increases as we scroll through Act I
        // When Act II starts, the string snaps/tightens significantly
        const baseStiffness = 0.02;
        const addedStiffnessI = act1Progress * 0.08;
        const addedStiffnessII = act2Progress * 0.5; // Very rigid in Act II
        const stiffness = baseStiffness + addedStiffnessI + addedStiffnessII;

        const damping = 0.85; // Air friction
        const interactionDist = 150 + (1 - act1Progress) * 100; // Radius of mouse influence

        for (let i = 1; i < this.pointsCount - 1; i++) {
            let p = this.points[i];

            // Mouse interaction (repulsion)
            const dy = state.mouse.y - p.y;
            const dx = state.mouse.x - p.x;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < interactionDist) {
                // If close, push the string away strongly, but less so if it's tense
                const force = (1 - dist / interactionDist) * (20 * (1 - act1Progress * 0.8));
                // Direction of push
                p.vx -= (dx / dist) * force;
            }

            // Spring force pulling back to center
            const springForce = (p.baseX - p.x) * stiffness;
            p.vx += springForce;

            // Apply velocity and damping
            p.vx *= damping;
            p.x += p.vx;

            // Add a tiny bit of organic wind/noise based on time if we are in Act I
            if (act2Progress === 0) {
                p.vx += Math.sin((Date.now() * 0.001) + (p.y * 0.01)) * 0.1;
            }
        }
    }

    draw(ctx) {
        ctx.beginPath();
        // Glow effect
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        ctx.strokeStyle = this.color;

        // Dynamic thickness based on tension
        ctx.lineWidth = 1 + (state.acts[1].progress * 2);

        ctx.moveTo(this.points[0].x, this.points[0].y);

        // Curve through points for a smooth organic line
        for (let i = 1; i < this.pointsCount - 1; i++) {
            const xc = (this.points[i].x + this.points[i + 1].x) / 2;
            const yc = (this.points[i].y + this.points[i + 1].y) / 2;
            ctx.quadraticCurveTo(this.points[i].x, this.points[i].y, xc, yc);
        }

        // Connect to last point
        const last = this.points[this.pointsCount - 1];
        ctx.lineTo(last.x, last.y);

        ctx.stroke();

        // Reset shadow
        ctx.shadowBlur = 0;
    }
}

// --- ACT III PHYSICS (The Architecture blocks) ---
class ArchitectureBlocks {
    constructor(color) {
        this.color = color;
        this.cubes = [];
        this.init();
    }

    init() {
        this.cubes = [];
        // Create a 3x3 grid of cubes
        const spacing = 150;
        for (let x = -1; x <= 1; x++) {
            for (let y = -1; y <= 1; y++) {
                this.cubes.push({
                    ox: x * spacing,
                    oy: y * spacing,
                    oz: (Math.random() - 0.5) * spacing,
                    size: 40 + Math.random() * 20
                });
            }
        }
    }

    draw(ctx, progress) {
        if (progress <= 0) return;

        ctx.save();
        ctx.globalAlpha = progress; // Fade in
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 1;

        const cx = state.width / 2;
        const cy = state.height / 2;

        // Base rotation based on progress
        const rotY = progress * Math.PI;
        const rotX = progress * Math.PI * 0.5;

        const cosY = Math.cos(rotY);
        const sinY = Math.sin(rotY);
        const cosX = Math.cos(rotX);
        const sinX = Math.sin(rotX);

        // Draw each cube
        this.cubes.forEach(c => {
            const s = c.size;
            // 8 vertices of a cube
            const verts = [
                { x: -s, y: -s, z: -s }, { x: s, y: -s, z: -s },
                { x: s, y: s, z: -s }, { x: -s, y: s, z: -s },
                { x: -s, y: -s, z: s }, { x: s, y: -s, z: s },
                { x: s, y: s, z: s }, { x: -s, y: s, z: s }
            ];

            const projected = verts.map(v => {
                // translate by offset
                let px = v.x + c.ox;
                let py = v.y + c.oy;
                let pz = v.z + c.oz;

                // spread them out initially, and pull them together as progress nears 1
                const spread = 1 + (1 - progress) * 2;
                px *= spread;
                py *= spread;
                pz *= spread;

                // Rot Y
                let x1 = px * cosY - pz * sinY;
                let z1 = pz * cosY + px * sinY;

                // Rot X
                let y1 = py * cosX - z1 * sinX;
                let z2 = z1 * cosX + py * sinX;

                // Perspective
                const zOff = z2 + 600;
                const projX = (x1 / zOff) * 800 + cx;
                const projY = (y1 / zOff) * 800 + cy;

                return { x: projX, y: projY };
            });

            // Draw Edges
            const edges = [
                [0, 1], [1, 2], [2, 3], [3, 0],
                [4, 5], [5, 6], [6, 7], [7, 4],
                [0, 4], [1, 5], [2, 6], [3, 7]
            ];

            ctx.beginPath();
            edges.forEach(e => {
                ctx.moveTo(projected[e[0]].x, projected[e[0]].y);
                ctx.lineTo(projected[e[1]].x, projected[e[1]].y);
            });
            ctx.stroke();
        });

        ctx.restore();
    }
}

// --- ACT IV PHYSICS (The Kintsugi repair) ---
class KintsugiParticles {
    constructor(count) {
        this.count = count;
        this.particles = [];
        this.init();
    }

    init() {
        this.particles = [];
        const cx = state.width / 2;
        const cy = state.height / 2;

        for (let i = 0; i < this.count; i++) {
            // Start from center
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 10;
            this.particles.push({
                x: cx + (Math.random() - 0.5) * 100,
                y: cy + (Math.random() - 0.5) * 100,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: Math.random()
            });
        }
    }

    update(progress) {
        if (progress <= 0 || progress >= 1) return; // Don't process if not active

        // Progress 0 -> 0.4 is explosion
        // Progress 0.4 -> 1.0 is freezing and connecting

        let timeScale = 1.0;
        if (progress > 0.4) {
            // slow time to a halt
            timeScale = Math.max(0, 1.0 - ((progress - 0.4) * 2));
        }

        const cx = state.width / 2;
        const cy = state.height / 2;

        this.particles.forEach(p => {
            p.x += p.vx * timeScale;
            p.y += p.vy * timeScale;

            // Add a tiny bit of drift
            p.vx += (Math.random() - 0.5) * 0.1 * timeScale;
            p.vy += (Math.random() - 0.5) * 0.1 * timeScale;

            // Mouse repel slightly
            const dx = state.mouse.x - p.x;
            const dy = state.mouse.y - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 100) {
                p.x -= (dx / dist) * 2 * timeScale;
                p.y -= (dy / dist) * 2 * timeScale;
            }

            // wrap around bounds gently
            if (p.x < 0) p.x = state.width;
            if (p.x > state.width) p.x = 0;
            if (p.y < 0) p.y = state.height;
            if (p.y > state.height) p.y = 0;
        });
    }

    draw(ctx, progress, act5Progress) {
        if (progress <= 0) return;

        ctx.save();
        // Fade out rapidly in act 5
        ctx.globalAlpha = Math.max(0, progress * (1 - act5Progress * 2));

        // Draw particles (shards)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        this.particles.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
            ctx.fill();
        });

        // Draw Gold connections (Kintsugi) if progress > 0.3
        if (progress > 0.3) {
            const connectAlpha = (progress - 0.3) * 1.4; // 0 to 1
            ctx.strokeStyle = `rgba(212, 175, 55, ${connectAlpha})`;
            ctx.lineWidth = 1;
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#D4AF37';

            ctx.beginPath();
            for (let i = 0; i < this.count; i++) {
                for (let j = i + 1; j < this.count; j++) {
                    const p1 = this.particles[i];
                    const p2 = this.particles[j];
                    const dx = p1.x - p2.x;
                    const dy = p1.y - p2.y;
                    const distSq = dx * dx + dy * dy;

                    // Connect nearest neighbors
                    if (distSq < 15000) {
                        ctx.moveTo(p1.x, p1.y);
                        ctx.lineTo(p2.x, p2.y);
                    }
                }
            }
            ctx.stroke();
        }

        ctx.restore();
    }
}

// --- ACT V PHYSICS (The Resonance Ripple) ---
class RippleSurface {
    constructor() {
        this.nodes = [];
        this.numNodes = 100;
        this.spring = 0.05;
        this.friction = 0.90; // Water resistance
        this.init();
    }

    init() {
        this.nodes = [];
        for (let i = 0; i < this.numNodes; i++) {
            this.nodes.push({ y: 0, vy: 0 }); // relative height
        }
    }

    splash(index, speed) {
        if (index >= 0 && index < this.numNodes) {
            this.nodes[index].vy = speed;
        }
    }

    update(progress) {
        if (progress <= 0) return;

        // Update physics
        for (let i = 0; i < this.numNodes; i++) {
            // Spring to baseline
            this.nodes[i].vy -= this.spring * this.nodes[i].y;
            this.nodes[i].vy *= this.friction;
            this.nodes[i].y += this.nodes[i].vy;
        }

        // Propagation
        const spread = 0.15;
        let leftDeltas = new Array(this.numNodes).fill(0);
        let rightDeltas = new Array(this.numNodes).fill(0);

        for (let pass = 0; pass < 2; pass++) {
            for (let i = 0; i < this.numNodes; i++) {
                if (i > 0) {
                    leftDeltas[i] = spread * (this.nodes[i].y - this.nodes[i - 1].y);
                    this.nodes[i - 1].vy += leftDeltas[i];
                }
                if (i < this.numNodes - 1) {
                    rightDeltas[i] = spread * (this.nodes[i].y - this.nodes[i + 1].y);
                    this.nodes[i + 1].vy += rightDeltas[i];
                }
            }
            // Apply
            for (let i = 0; i < this.numNodes; i++) {
                if (i > 0) this.nodes[i - 1].y += leftDeltas[i];
                if (i < this.numNodes - 1) this.nodes[i + 1].y += rightDeltas[i];
            }
        }

        // Mouse interaction
        // Map mouse X to node index
        if (state.mouse.y > state.height - 300) {
            const nodeIndex = Math.floor((state.mouse.x / state.width) * this.numNodes);
            // Drop a tiny pebble based on mouse movement speed (approximated here by constant tiny splash if moving)
            const dx = state.targetMouse.x - state.mouse.x;
            const dy = state.targetMouse.y - state.mouse.y;
            if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
                this.splash(nodeIndex, (Math.random() - 0.5) * 5);
            }
        }
    }

    draw(ctx, progress) {
        if (progress <= 0) return;

        ctx.save();
        ctx.globalAlpha = Math.min(1, progress * 1.5); // Fade in

        // Draw the fluid surface lines
        ctx.strokeStyle = '#F0F0F0';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#F0F0F0';

        const segmentWidth = state.width / (this.numNodes - 1);
        const baseY = state.height - 150; // water level

        // Draw multiple overlapping lines for depth
        for (let depth = 0; depth < 5; depth++) {
            const depthFactor = depth * 15;
            const alpha = 1 - (depth * 0.15);
            ctx.lineWidth = 1;
            ctx.strokeStyle = `rgba(240, 240, 240, ${alpha})`;

            ctx.beginPath();
            ctx.moveTo(0, baseY + depthFactor + this.nodes[0].y * (1 - depth * 0.1));

            for (let i = 1; i < this.numNodes; i++) {
                ctx.lineTo(i * segmentWidth, baseY + depthFactor + this.nodes[i].y * (1 - depth * 0.1));
            }
            ctx.stroke();
        }

        ctx.restore();
    }
}

function drawBackground() {
    // Subtle gradient void
    const grad = atmosphereCtx.createLinearGradient(0, 0, 0, state.height);
    grad.addColorStop(0, '#08080A');
    grad.addColorStop(1, '#000000');
    atmosphereCtx.fillStyle = grad;
    atmosphereCtx.fillRect(0, 0, state.width, state.height);

    // TODO: Add subtle fog/particle drift logic here
}

function drawPhysics() {
    physicsCtx.clearRect(0, 0, state.width, state.height);

    const act1 = state.acts[0].progress;
    const act2 = state.acts[1].progress;

    // Fade out the thread as we enter Act III (state.acts[2].progress)
    const act3 = state.acts[2].progress;
    physicsCtx.globalAlpha = 1 - act3;

    if (theThread) {
        theThread.update(act1, act2);
        theThread.draw(physicsCtx);
    }

    physicsCtx.globalAlpha = 1.0;

    if (theBlocks && act3 > 0) {
        // Fade out blocks during Act IV and completely in Act V
        const act4 = state.acts[3].progress;
        const act5 = state.acts[4].progress;
        physicsCtx.globalAlpha = Math.max(0, 1 - (act4 * 0.8) - (act5 * 2));
        theBlocks.draw(physicsCtx, act3);
        physicsCtx.globalAlpha = 1.0;
    }

    const act4 = state.acts[3].progress;
    const act5 = state.acts[4].progress;

    if (theKintsugi && act4 > 0) {
        theKintsugi.update(act4);
        theKintsugi.draw(physicsCtx, act4, act5);
    }

    if (theRipple && act5 > 0) {
        // Drop a big rock when we first enter act 5 deeply
        if (act5 > 0.5 && act5 < 0.55 && Math.random() > 0.8) {
            theRipple.splash(Math.floor(theRipple.numNodes / 2), 100);
        }
        theRipple.update(act5);
        theRipple.draw(physicsCtx, act5);
    }
}

function loop() {
    calculateScrollProgress();
    updateMouseEase();

    drawBackground();
    drawPhysics();

    requestAnimationFrame(loop);
}

// Boot
let theThread = new PhysicsString(60, '#F0F0F0');
let theBlocks = new ArchitectureBlocks('rgba(255, 255, 255, 0.4)'); // slightly transparent white
let theKintsugi = new KintsugiParticles(120);
let theRipple = new RippleSurface();

// Inject resize handler update
const originalResize = resizeCanvases;
resizeCanvases = function () {
    originalResize();
    if (theThread) theThread.resize();
    if (theBlocks) theBlocks.init();
    if (theKintsugi) {
        // Only re-init if not heavily scrolled to prevent jarring reset
        if (state.acts[3].progress < 0.1) theKintsugi.init();
    }
    if (theRipple) theRipple.init();
};

resizeCanvases();
initObservers();
loop();
