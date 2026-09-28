import winston from 'winston';

const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

// Nettoyage des metadonnees avant ecriture.
//
// Pourquoi ici et pas sur les 40 appels : une erreur axios journalisee telle
// quelle embarque `config.headers.Authorization`, donc le jeton d'acces
// Spotify EN CLAIR dans les journaux du conteneur. Constate le 28/09/2026,
// 27 lignes concernees sur 30 jours. Corriger au niveau du logger couvre
// tous les appels existants et tous ceux a venir.
const SECRETS = /^(authorization|cookie|set-cookie|token|password|secret|api[_-]?key|client[_-]?secret)$/i;

function nettoyer(valeur: unknown, profondeur = 0): unknown {
  if (profondeur > 6 || valeur == null) return valeur;

  if (typeof valeur === "string") {
    return valeur
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, "Bearer [masque]")
      .replace(/\b[A-Za-z0-9_-]{60,}\b/g, "[masque]");
  }
  if (typeof valeur !== "object") return valeur;
  if (Array.isArray(valeur)) return valeur.slice(0, 50).map(v => nettoyer(v, profondeur + 1));

  const o = valeur as Record<string, unknown>;

  // Erreur axios : on ne garde que ce qui sert au diagnostic. Le reste (config,
  // en-tetes, requete, reponse complete) est du bruit qui porte les secrets.
  if (o.isAxiosError === true || (o.name === "AxiosError" && o.config)) {
    const cfg = (o.config ?? {}) as Record<string, unknown>;
    return {
      type: "AxiosError",
      message: o.message,
      code: o.code,
      status: (o as { status?: unknown }).status ?? (o.response as Record<string, unknown> | undefined)?.status,
      method: cfg.method,
      url: nettoyer(cfg.url, profondeur + 1),
    };
  }

  if (valeur instanceof Error) {
    return { message: valeur.message, name: valeur.name, stack: valeur.stack?.split("\n").slice(0, 5).join("\n") };
  }

  const sortie: Record<string, unknown> = {};
  for (const [cle, v] of Object.entries(o)) {
    sortie[cle] = SECRETS.test(cle) ? "[masque]" : nettoyer(v, profondeur + 1);
  }
  return sortie;
}

const caviardage = winston.format(info => {
  for (const cle of Object.keys(info)) {
    if (cle === "level" || cle === "message" || cle === "timestamp") continue;
    // La cle de premier niveau se teste aussi : `logger.error(x, { token })`
    // est aussi courant qu'un secret imbrique.
    (info as Record<string, unknown>)[cle] = SECRETS.test(cle)
      ? "[masque]"
      : nettoyer((info as Record<string, unknown>)[cle]);
  }
  return info;
});

// Custom format for better readability
const customFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}] ${message}`;

  // Add metadata if present
  const metaKeys = Object.keys(metadata);
  if (metaKeys.length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }

  return msg;
});

// Create logger instance
export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    // APRES splat(), pas avant : splat() reinjecte les metadonnees d'origine
    // dans info et ecraserait un caviardage fait trop tot. Verifie, la premiere
    // version placait ce format en tete et n'avait aucun effet.
    caviardage(),
    winston.format.json()
  ),
  defaultMeta: { service: 'blindify-backend' },
  transports: [
    // Console transport with colors for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        customFormat
      )
    })
  ]
});

// Add file transports in production
if (process.env.NODE_ENV === 'production') {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  );

  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  );
}

// Export convenience methods
export const logError = (message: string, error?: Error | unknown, metadata?: any) => {
  if (error instanceof Error) {
    logger.error(message, { error: error.message, stack: error.stack, ...metadata });
  } else {
    logger.error(message, { error, ...metadata });
  }
};

export const logInfo = (message: string, metadata?: any) => {
  logger.info(message, metadata);
};

export const logWarn = (message: string, metadata?: any) => {
  logger.warn(message, metadata);
};

export const logDebug = (message: string, metadata?: any) => {
  logger.debug(message, metadata);
};
