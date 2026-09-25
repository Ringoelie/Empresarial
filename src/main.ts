import './styles.css';
import { Engine, Quality } from './render/engine';
import { CityView } from './render/city';
import { WorldView } from './render/world';
import { Game } from './game/game';
import { UI } from './ui/ui';
import { showStart } from './ui/start';
import * as sim from './game/sim';
import { COUNTRY_BY_ID, subsidiaryCost } from './game/data';

const QUALITY_KEY = 'empresarial-quality';

function initialQuality(): Quality {
  try {
    const q = localStorage.getItem(QUALITY_KEY) as Quality | null;
    if (q === 'low' || q === 'medium' || q === 'high') return q;
  } catch { /* sin almacenamiento */ }
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || window.innerWidth < 820;
  return mobile ? 'low' : 'medium';
}

async function main() {
  const viewport = document.getElementById('viewport')!;
  const loading = document.getElementById('loading')!;
  const engine = new Engine(viewport);
  try {
    await engine.init(initialQuality());
  } catch (err) {
    loading.querySelector('.loading-text')!.textContent = 'Tu navegador no soporta WebGPU ni WebGL2. Prueba con Chrome, Edge o Firefox actualizados.';
    loading.querySelector('.spinner')?.remove();
    console.error(err);
    return;
  }
  loading.classList.add('hide');
  setTimeout(() => loading.remove(), 500);

  const launch = (game: Game) => {
    const accent = game.s.color;
    const city = new CityView(engine.dom, accent);
    const world = new WorldView(engine.dom, accent);
    const applyQuality = (q: Quality) => {
      const shadows = q !== 'low';
      city.setShadows(shadows, q === 'high' ? 2048 : 1024);
      try { localStorage.setItem(QUALITY_KEY, q); } catch { /* ignorar */ }
    };
    engine.onQualityChange = applyQuality;
    applyQuality(engine.quality);

    const canOpen = (id: string) => {
      const s = game.s;
      return sim.hasResearch(s, 'intl') && s.subsidiaries.length < sim.subsidiaryLimit(s) && s.cash >= subsidiaryCost(COUNTRY_BY_ID[id], 0);
    };
    const syncWorld = () => world.sync(game.s, canOpen);

    let ui: UI;
    const setView = (v: 'city' | 'world') => {
      engine.setView(v === 'city' ? city : world);
      if (v === 'world') syncWorld();
      ui.setView(v);
    };
    ui = new UI(game, engine, city, world, {
      newGame: () => { Game.clearSave(); location.reload(); },
      setView,
    });

    city.sync(game.s, false);
    syncWorld();
    world.focusCountry(game.s.home);
    game.on('world', () => { city.sync(game.s); syncWorld(); });
    game.on('month', () => syncWorld());
    game.on('stage', () => city.sync(game.s));

    engine.setView(city);
    ui.setView('city');
    engine.onFrame = (dt) => {
      game.update(dt);
      ui.tick();
    };
    engine.start();
    // precompila la vista mundial en segundo plano para que el cambio sea instantáneo
    setTimeout(() => engine.warmup(world), 1500);

    const save = () => { if (!game.s.bankrupt) game.save(); };
    engine.onDeviceLost = save;
    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
    window.addEventListener('beforeunload', save);
    setInterval(save, 60_000);
    if (game.s.day === 0) setTimeout(() => ui.helpModal(), 300);
    Object.assign(window as object, { game, __views: { city, world, engine, sim } }); // ayuda para depurar desde la consola
  };

  const saved = Game.hasSave() ? Game.load() : null;
  showStart({
    canContinue: !!saved && !saved.s.bankrupt,
    backend: engine.backend,
    onNew: (o) => { Game.clearSave(); const g = Game.create(o); g.save(); launch(g); },
    onContinue: () => launch(saved!),
  });
}

main();
