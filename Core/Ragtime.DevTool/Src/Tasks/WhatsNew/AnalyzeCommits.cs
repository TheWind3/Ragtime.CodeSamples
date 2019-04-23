namespace Ragtime.DevTool {
  using System.Threading.Tasks;
  using System.Linq;
  using System.Collections.Generic;
  using System.Text.RegularExpressions;
  using Git = LibGit2Sharp;


  /// <summary>Обработчик: анализируем историю commit-ов, записываем результат анализа в файл *.manifest-commits</summary>
  public class AnalyzeCommits: BuildTask {
    public override string Name => "analyze-commits";

    protected override Task Execute() {
      var repoPath = Git.Repository.Discover(Project.Directory);
      using(var repo = new Git.Repository(repoPath)) {
        var ragtimeCommits = GetRagtimeCommits(GetGitCommits(repo));
        Modified = CommitsFile.Append(ragtimeCommits);
      }

      return Task.FromResult(true);
    }

    /// <summary>Возвращаем список необработанных git-коммитов</summary>
    private IEnumerable<Git.Commit> GetGitCommits(Git.Repository repo) {
      IEnumerable<Git.Commit> result = repo.Commits;
      var lastKnownId = CommitsFile.GetLastCommitId();
      if(lastKnownId != null)
        result = result.TakeWhile(_ => _.Sha != lastKnownId);
      return result.Reverse();
    }

    /// <summary>Превращаем список git-коммитов  в список ragtime-коммитов</summary>
    private IEnumerable<CommitsFile.Item> GetRagtimeCommits(IEnumerable<Git.Commit> gitCommits) {
      foreach(var gitCommit in gitCommits) {
        foreach(var taskId in ParseMessage(gitCommit.Message)) {
          yield return new CommitsFile.Item {
            Id     = gitCommit.Sha,
            Date   = gitCommit.Committer.When.ToString("s"),
            TaskId = taskId,
          };
        }
      }
    }

    /// <summary>Парсим текст гитового коммита, возвращаем номера сделанных задач. Никогда не возвращаем null</summary>
    private IReadOnlyList<string> ParseMessage(string value) {
      if(value == null)
        return new string[0];
      var matches = _reTaskId.Matches(value);
      if(matches.Count == 0)
        return new string[0];
      var result = new List<string>(matches.Count);
      foreach(Match match in matches)
        result.Add(match.Groups[1].Value);
      return result;
    }
    private static Regex _reTaskId = new Regex(@"\[(\d+)\]", RegexOptions.Compiled);
  }
}
