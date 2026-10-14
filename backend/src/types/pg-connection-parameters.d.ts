// Resolution des parametres de connexion de pg (meme lecture que le Pool :
// adresse, variables PG*, USER). Utilisee par config/databaseGuard.ts ;
// @types/pg ne declare pas ce chemin.
declare module "pg/lib/connection-parameters" {
  export default class ConnectionParameters {
    constructor(config?: { connectionString?: string })
    database?: string
    user?: string
  }
}
