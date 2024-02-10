{ inputs, cell }:
let
  inherit (inputs) nixpkgs std;
  l = nixpkgs.lib // builtins;

  version = "1.0.0";

  db_schema_script = std.incl (inputs.self + /install)
    [ (inputs.self + /install/database_schema.sql) ];
in rec {
  hanabi-live = nixpkgs.writeShellScriptBin "hanabi-live" ''
    export VERSION=${cell.packages.server.version}
    export CLIENT_DIST=${cell.packages.client}
    export DATADIR=${cell.packages.misc}
    export VIEWSPATH="${cell.packages.views}/share/views"
    ${install_schema}/bin/install_schema
    ${server}/bin/hanabi-live
  '';

  install_schema = nixpkgs.writeShellApplication {
    name = "install_schema";

    runtimeInputs = with nixpkgs; [ postgresql ];
    text = ''
      if [[ -e ".env" ]]; then
        # shellcheck source=/dev/null
        source ".env"
      fi

      PGPASSWORD="$DB_PASSWORD" psql \
        --quiet \
        --variable=ON_ERROR_STOP=1 \
        --host="$DB_HOST" \
        --port="$DB_PORT" \
        --username="$DB_USER" \
        --dbname="$DB_NAME" \
        < ${db_schema_script + /database_schema.sql}
    '';
  };

  server = nixpkgs.buildGoModule rec {
    name = "server";
    inherit version;

    src = std.incl (inputs.self) [ (inputs.self + /server) ];
    vendorHash = "sha256-LopGiHjKgFfXnfS91wGGfXI9P6i0OcKy9OszVCEZHNw=";

    sourceRoot = "${src.name}/server/src";
  };

  misc = std.incl (inputs.self) [ (inputs.self + /misc) ];

  views = nixpkgs.stdenv.mkDerivation {
    name = "views";
    src = std.incl (inputs.self) [ (inputs.self + /server/src/views) ];

    installPhase = ''
      mkdir -p $out/share/views

      cp -r server/src/views/* $out/share/views/
    '';
  };

  client = nixpkgs.buildNpmPackage rec {
    name = "client";
    inherit version;

    src = std.incl (inputs.self) [
      (inputs.self + /package.json)
      (inputs.self + /package-lock.json)
      (inputs.self + /tsconfig.json)
      (inputs.self + /packages)
      (inputs.self + /public)
    ];

    nativeBuildInputs = with nixpkgs; [ esbuild nodePackages.grunt-cli ];

    npmDepsHash = l.fakeHash;
    npmDeps = nixpkgs.fetchNpmDeps {
      inherit src;
      hash = "sha256-c7eNHhLVWa33/BWYx6QcqhzSm1NyPqT7DAAWvK1pMTE=";
    };

    buildPhase = ''
      mkdir -p public/js/bundles public/css
      echo "module.exports = { VERSION: \"${version}\" };" > packages/data/src/version.js
      echo "${version}" > public/js/bundles/version.txt
      cd packages/client
      esbuild src/main.ts --bundle --outfile="../../public/js/bundles/main.${version}.min.js" --minify --sourcemap="linked"
      grunt
      cd ../../
    '';

    installPhase = ''
      mkdir -p $out/public/css
      mkdir -p $out/packages/game/src/json/
      mkdir -p $out/packages/server/src/json/
      cp -r packages/client/grunt_output/* $out/public/css/
      cp -r public $out/
      cp public/js/bundles/main.${version}.min.js $out/public/js/bundles/main.min.js
      ls -al
      cp -r packages/game/src/json/* $out/packages/game/src/json/
      cp -r packages/server/src/json/* $out/packages/server/src/json/
    '';
  };
}
