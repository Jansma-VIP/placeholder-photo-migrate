export function parseOptions(argv) {
  const options = {
    write: false,
    check: false,
    help: false,
    version: false,
    report: null,
    providers: [],
    target: '.',
  };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--') {
      positional.push(...argv.slice(index + 1));
      break;
    }
    if (argument === '--write') options.write = true;
    else if (argument === '--check') options.check = true;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--version' || argument === '-v') options.version = true;
    else if (argument === '--provider') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error('--provider requires a provider name.');
      options.providers.push(value);
    } else if (argument.startsWith('--provider=')) {
      options.providers.push(argument.slice('--provider='.length));
    } else if (argument === '--report') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error('--report requires a file path.');
      options.report = value;
    } else if (argument.startsWith('--report=')) {
      options.report = argument.slice('--report='.length);
    } else if (argument.startsWith('-')) {
      throw new Error(`Unknown option: ${argument}`);
    } else {
      positional.push(argument);
    }
  }

  if (positional.length > 1) throw new Error('Provide exactly one project path.');
  if (positional.length === 1) options.target = positional[0];
  if (options.write && options.check) throw new Error('--write and --check cannot be used together.');
  if (options.report === '') throw new Error('--report requires a file path.');
  return options;
}
