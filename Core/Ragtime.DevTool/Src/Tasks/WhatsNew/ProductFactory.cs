namespace ProductFactory {
  using System.ServiceModel;
  using System.Threading.Tasks;


  internal static class WhatsNewService {

    public static async Task<WhatsNewPortTypeClient> Connect() {
      var binding = new BasicHttpBinding();
      binding.Security.Mode = BasicHttpSecurityMode.TransportCredentialOnly;
      binding.Security.Transport.ClientCredentialType = HttpClientCredentialType.Basic;
      binding.MaxReceivedMessageSize = int.MaxValue;
      binding.MaxBufferSize = int.MaxValue;
      binding.MaxBufferPoolSize = int.MaxValue;
      binding.ReceiveTimeout = System.TimeSpan.FromMinutes(5);

      var endpoint = new EndpointAddress("http://tirex3/ProductFactory/ws/WhatsNew");

      var client = new WhatsNewPortTypeClient(binding, endpoint);
      client.ClientCredentials.UserName.UserName = "IUSR";
      client.ClientCredentials.UserName.Password = "";

      await client.PingAsync();
      return client;
    }
  }
}
