const rows=[
 ['required','{{label}} is required.','{{label}} est obligatoire.','{{label}} ist erforderlich.','{{label}} é obrigatório.'],
 ['number','{{label}} must be a number or a fraction such as 1/2.','{{label}} doit être un nombre ou une fraction comme 1/2.','{{label}} muss eine Zahl oder ein Bruch wie 1/2 sein.','{{label}} deve ser um número ou uma fração como 1/2.'],
 ['finite','{{label}} must be finite.','{{label}} doit être fini.','{{label}} muss endlich sein.','{{label}} deve ser finito.'],
 ['denominator','{{label}} cannot have a zero denominator.','{{label}} ne peut pas avoir un dénominateur nul.','{{label}} darf keinen Nenner null haben.','{{label}} não pode ter denominador zero.'],
];
export const biometricInputMessages=Object.freeze(Object.fromEntries(['en','fr','de','pt-BR'].map((language,index)=>[language,Object.freeze(Object.fromEntries(rows.map(([key,...values])=>['biometricInput.'+key,values[index]])))])));
