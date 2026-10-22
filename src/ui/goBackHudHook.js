/**
 * PIXELLAB_HOOK: top-right GO! / Back! button art.
 * Catalog keys already exist under assets/library/ui/floats/.
 * Gameplay owns the press, the summon, and the recall.
 * Boot publishes this object on the registry as `goBackHudHook` so a
 * later scene can place the art. This module does not spawn floats
 * and does not change pet combat.
 */
export const GO_BACK_HUD_HOOK = {
  go: 'ui-float-go',
  back: 'ui-float-back',
  goSm: 'ui-float-go-sm',
  goHd: 'ui-float-go-hd',
  backSm: 'ui-float-back-sm',
  backHd: 'ui-float-back-hd',
  goBurst: 'ui-float-go-burst',
  goBurstHd: 'ui-float-go-burst-hd',
  backBurst: 'ui-float-back-burst',
  backBurstHd: 'ui-float-back-burst-hd',
};
