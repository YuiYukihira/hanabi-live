{ inputs, cell }: {
  hanabi-live = { config, lib, pkgs, ... }:
    with lib;
    let
      cfg = config.services.hanabi-live;
      start-command = pkgs.writeShellScriptBin "start-hanabi" ''
        DB_USER=${cfg.db.userName} \
        DB_PASSWORD=${cfg.db.userPassword} \
        DB_HOST=${
          if cfg.db.host == "nix-service" then "localhost" else cfg.db.host
        } \
        DB_PORT=${cfg.db.port} \
        DB_NAME=${cfg.db.name} \
        DOMAIN=${cfg.domain} \
        SESSION_SECRET="${cfg.sessionSecret}" \
        PORT="${cfg.port}" \
        ${cfg.package}/bin/hanabi-live
      '';
    in {
      imports = [ inputs.helpers.outputs.devshellProfiles.services.postgres ];

      options.services.hanabi-live = {
        enable = mkEnableOption "Enable the service";
        package = mkOption {
          type = types.package;
          default = inputs.cells.hanabi-live.packages.hanabi-live;
          description = "Hanabi live package to use";
        };
        db = {
          userName = mkOption {
            type = types.str;
            default = "hanabiuser";
            description = "User to log into the DB as";
          };
          userPassword = mkOption {
            type = types.str;
            default = "1234567890";
            description = "DB user's password";
          };
          name = mkOption {
            type = types.str;
            default = "hanabi";
            description = "Name of DB to use";
          };
          host = mkOption {
            type = types.str;
            default = "nix-service";
            description =
              "Which DB to connect to (Set to 'nix-service' to automatically start postgres with this service)";
          };
          port = mkOption {
            type = types.str;
            default = "5432";
            description = "Port of DB host to use";
          };
        };
        domain = mkOption {
          type = types.str;
          default = "localhost";
          description = "Domain to host on, determines dev mode";
        };
        port = mkOption {
          type = types.str;
          default = "30000";
          description = "Port to host on";
        };
        sessionSecret = mkOption {
          type = types.str;
          default = "''$(tr -dc A-Za-z0-9 </dev/urandom | head -c 13; echo)";
          description = "The session secret to use";
        };
      };

      config = {
        __services.hanabi-live = {
          command = "sleep 3; ${start-command}/bin/start-hanabi";
          enable = cfg.enable;
          depends = mkIf (cfg.db.host == "nix-service") [ "postgres" ];
        };
        services.postgres.createUserDB =
          mkIf (cfg.db.host == "nix-service") false;
        services.postgres.extraSetup = mkIf (cfg.db.host == "nix-service") ''
          CREATE USER ${cfg.db.userName} WITH PASSWORD '${cfg.db.userPassword}';
          CREATE DATABASE ${cfg.db.name};
          GRANT ALL PRIVILEGES ON DATABASE ${cfg.db.name} TO ${cfg.db.userName};
          GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${cfg.db.userName};
        '';
      };
    };
}
