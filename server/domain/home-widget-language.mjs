import {parseAppLanguage} from './app-language.mjs';
import {nutrientDisplayName} from './public/nutrient-language.js';

const rows={
 nutrient:['{0}: {1}','{0} : {1}','{0}: {1}','{0}: {1}'],
 unknown:['Unknown','Inconnu','Unbekannt','Desconhecido'],
 consumed:['Calories consumed','Calories consommées','Kalorien aufgenommen','Calorias consumidas'],
 remaining:['Calories remaining','Calories restantes','Kalorien verbleibend','Calorias restantes'],
 consumedKj:['Energy consumed','Énergie consommée','Energie aufgenommen','Energia consumida'],
 remainingKj:['Energy remaining','Énergie restante','Energie verbleibend','Energia restante'],
 target:['Target: {0}','Objectif : {0}','Ziel: {0}','Meta: {0}'],
 duration:['{0}h {1}m','{0} h {1} min','{0} Std. {1} Min.','{0} h {1} min'],
 fasting:['Fasting','Jeûne','Fasten','Jejum'],
 inactive:['No active fast','Aucun jeûne en cours','Kein laufendes Fasten','Nenhum jejum ativo'],
 next:['Next scheduled start: {0}','Prochain début prévu : {0}','Nächster geplanter Beginn: {0}','Próximo início agendado: {0}'],
 unscheduled:['No scheduled start','Aucun début prévu','Kein Beginn geplant','Nenhum início agendado'],
 future:['Recorded start is in the future','Le début enregistré est dans le futur','Erfasster Beginn liegt in der Zukunft','O início registrado está no futuro'],
 elapsed:['{0} elapsed','{0} écoulées','{0} vergangen','{0} decorridos'],
 start:['Start: {0}','Début : {0}','Beginn: {0}','Início: {0}'],
 open:['Open-ended','Sans durée définie','Ohne Zeitlimit','Sem duração definida'],
 goal:['Goal: {0} hours','Objectif : {0} heures','Ziel: {0} Stunden','Meta: {0} horas'],
 until:['{0} until next start','{0} avant le prochain début','{0} bis zum nächsten Beginn','{0} até o próximo início'],
 completedOne:['{0} completed fast','{0} jeûne terminé','{0} abgeschlossene Fastenphase','{0} jejum concluído'],
 completedOther:['{0} completed fasts','{0} jeûnes terminés','{0} abgeschlossene Fastenphasen','{0} jejuns concluídos'],
 recorded:['{0} recorded in completed fasts','{0} enregistrées dans les jeûnes terminés','{0} in abgeschlossenen Fastenphasen erfasst','{0} registrados em jejuns concluídos']
};
export function homeWidgetLanguage(language='en'){
 parseAppLanguage(language);const index=['en','fr','de','pt-BR'].indexOf(language);
 const number=value=>new Intl.NumberFormat(language,{maximumFractionDigits:1}).format(value);
 const text=(key,...args)=>rows[key][index].replace(/\{(\d+)\}/g,(_,i)=>String(args[Number(i)]));
 return {number,text,nutrient:row=>nutrientDisplayName(row,language),duration:milliseconds=>{
  const minutes=Math.floor(Math.max(0,milliseconds)/60000);return text('duration',number(Math.floor(minutes/60)),number(minutes%60));
 }};
}
