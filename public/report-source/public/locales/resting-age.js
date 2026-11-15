const rows=[
 ['title','Age used in this calculation','Âge utilisé pour ce calcul','Alter für diese Berechnung','Idade usada neste cálculo'],
 ['unknown','Unknown','Inconnu','Unbekannt','Desconhecido'],
 ['years_one','{{years}} year','{{years}} an','{{years}} Jahr','{{years}} ano'],
 ['years_other','{{years}} years','{{years}} ans','{{years}} Jahre','{{years}} anos'],
 ['on','on','le','am','em'],
 ['manual','Reviewed fixed age','Âge fixe vérifié','Geprüftes festes Alter','Idade fixa revisada'],
 ['birthDate','From the reviewed birth date','D’après la date de naissance vérifiée','Aus dem geprüften Geburtsdatum','Com base na data de nascimento revisada']
];
export const restingAgeMessages=Object.fromEntries(['en','fr','de','pt-BR'].map((language,index)=>[language,Object.fromEntries(rows.map(([key,...values])=>['restingAge.'+key,values[index]]))]));
