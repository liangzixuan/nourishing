import {uiMessages} from './report-source/public/locales/index.js';
import {formatMessage} from './report-source/public/message-format.js';
const sourceKeys=new Map(Object.entries(uiMessages.en).filter(([,value])=>typeof value==='string').map(([key,value])=>[value,key]));
const aliases={
 'Keep diary on this device':'offline.saveCopy','Refresh copy':'offline.refresh','Unlock diary':'offline.unlock','Remove device copy':'offline.forget','Saved · pending sync':'offline.savedHere','Date':'measurementLog.date','Time':'offline.time','Save pending':'offlineCorrection.save.food','Pending':'offlineCorrection.pending','No entries':'offlineDiary.empty','Serving':'offline.unit','Servings':'offlineDiary.servings','Date and group':'offlineCorrection.title.food','Duration (min)':'activity.duration','Calories (kcal)':'activity.energy','Energy unit':'activity.energyUnit','New custom measurement':'measurementLog.create','Name':'measurementLog.name','Nutrition summary':'report.summary','Consumed':'offlineDiary.consumed','Remaining':'offlineDiary.remaining','Target':'offlineDiary.energy.target','Nutrient':'report.nutrient','Export pending changes':'offline.export','Edit record':'offlineCorrection.review','Retry':'diary.retry','Discard':'common.remove',
};
// New cloud-shell labels have no matching source string. The source owns all
// domain labels, nutrient identities and existing action translations.
const cloud={
 'Sign in to unlock this diary.':['Connectez-vous pour ouvrir ce journal.','Melden Sie sich an, um dieses Tagebuch zu öffnen.','Entre para abrir este diário.'],
 'Saved on this device':['Enregistré sur cet appareil','Auf diesem Gerät gespeichert','Salvo neste dispositivo'],
 'Device copy removed':['Copie de l’appareil supprimée','Gerätekopie entfernt','Cópia do dispositivo removida'],
 'Waiting to sync':['En attente de synchronisation','Wartet auf Synchronisierung','Aguardando sincronização'],
 'Review pending changes':['Vérifiez les modifications en attente','Ausstehende Änderungen prüfen','Revise as alterações pendentes'],
 'Up to date':['À jour','Aktuell','Atualizado'],
 'Saving…':['Enregistrement…','Wird gespeichert…','Salvando…'],
 'Syncing…':['Synchronisation…','Synchronisierung…','Sincronizando…'],
 'Sync or discard pending changes first.':['Synchronisez ou supprimez d’abord les modifications en attente.','Ausstehende Änderungen zuerst synchronisieren oder verwerfen.','Sincronize ou descarte primeiro as alterações pendentes.'],
 'Exported':['Exporté','Exportiert','Exportado'],'Retry ready':['Prêt à réessayer','Bereit zum Wiederholen','Pronto para tentar novamente'],
 'Change':['Modifier','Änderung','Alterar'],'Sign in':['Se connecter','Anmelden','Entrar'],
 'Edit':['Modifier','Bearbeiten','Editar'],'Discard':['Supprimer','Verwerfen','Descartar'],'Retry':['Réessayer','Wiederholen','Tentar novamente'],
 'Nutrition summary':['Résumé nutritionnel','Nährstoffübersicht','Resumo nutricional'],'Nutrient':['Nutriment','Nährstoff','Nutriente'],
};
export const offlineLanguages=[['en','English'],['fr','Français'],['de','Deutsch'],['pt-BR','Português (Brasil)']];
export function offlineLanguage(value){return offlineLanguages.some(([code])=>code===value)?value:'en';}
export function offlineText(language,text){if(language==='en')return text;const index=['fr','de','pt-BR'].indexOf(language);if(index<0)return text;if(cloud[text])return cloud[text][index];const key=aliases[text]??sourceKeys.get(text);return key&&uiMessages[language]?.[key]?formatMessage(language,key):text;}
export const offlineMessage=(language,key,values)=>formatMessage(language,key,values);
