/** LiveOps scaffold — misje dzienne (Faza 3). */
export interface DailyMission {
  id: string;
  label: string;
  progress: number;
  target: number;
  rewardCoins: number;
}

export function defaultMissions(): DailyMission[] {
  return [
    { id: 'm1', label: 'Zdobądź 3 zamki', progress: 0, target: 3, rewardCoins: 50 },
    { id: 'm2', label: 'Zniszcz keystone < 60s', progress: 0, target: 1, rewardCoins: 40 },
    { id: 'm3', label: 'Wygraj bez power-upów', progress: 0, target: 2, rewardCoins: 60 },
  ];
}
