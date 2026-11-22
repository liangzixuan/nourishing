import {t} from '../app-language.js';
import {coreText} from '../core-cloud-messages.js';

export function diaryEnergyBudget(energy, mode = energy.display) {
  if (mode !== 'balance') {
    return {mode:'remaining', heading:t('mobileDiary.target'), label:t('mobileDiary.remaining'), value:energy.remaining};
  }
  const balance = energy.balance;
  const heading = t('energyReport.balance');
  if (!Number.isFinite(balance) || balance === 0) {
    return {mode:'balance', heading, label:heading, value:balance};
  }
  return {mode:'balance', heading, label:coreText(balance > 0 ? 'diary.energyDeficit' : 'diary.energySurplus'), value:Math.abs(balance)};
}
