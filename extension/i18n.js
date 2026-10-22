// Interface language only. Source content and persisted evidence are never translated.
export const locale = 'en';
const dictionaries={en:{completed:"Saved",partial:"Partially saved",failed:"Failed",interrupted:"Interrupted",cancelled:"Cancelled",queued:"Queued",capturing:"Reading page",writing:"Writing to disk",verifying:"Verifying file",attached:"Attached",orphaned:"Text not found",ambiguous:"Ambiguous anchor",pending:"Not checked",not_applicable:"Note",live_only:"Live page only",archived:"Archived",person:'Person',organization:'Organization',phone:'Phone',email:'Email',domain:'Domain',ip_address:'IP address',url:'URL',username:'Username',location:'Location',document:'Document',file:'File',hash:'Hash',custom:'Custom'}};
export const t=key=>dictionaries[locale][key] || key;
