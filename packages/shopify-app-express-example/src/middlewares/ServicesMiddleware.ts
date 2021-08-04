import { Request, Response } from "express";
import {
  ApiKey,
  ApiSecretKey,
  IAccessTokenRepository,
  IWebhookHandler,
  IWebhookService,
  WebhookHandler,
} from "@tsukiy0/shopify-app-core";
import { AbstractServicesMiddleware } from "@tsukiy0/extensions-express";
import { Guid, SystemConfiguration, Url } from "@tsukiy0/extensions-core";
import { DynamoAccessTokenRepository } from "../services/DynamoAccessTokenRepository";
import { DynamoWebhookTestRepository } from "../services/DynamoWebhookTestRepository";
import {
  GqlWebhookService,
  ShopifyGraphQlClient,
} from "@tsukiy0/shopify-app-infrastructure";
import { GqlCollectionService } from "../services/GqlCollectionService";

type Services = {
  shopifyApiKey: ApiKey;
  shopifyApiSecretKey: ApiSecretKey;
  accessTokenRepository: IAccessTokenRepository;
  hostUrl: Url;
  webhookHandler: IWebhookHandler;
  collectionService: GqlCollectionService;
  webhookService: IWebhookService;
};

export class ServicesMiddleware extends AbstractServicesMiddleware<Services> {
  buildServices = async (req: Request, res: Response): Promise<Services> => {
    const config = new SystemConfiguration();

    const tableName = config.get("TABLE_NAME");
    const shopifyApiKey = ApiKey.check(config.get("SHOPIFY_API_KEY"));
    const shopifyApiSecretKey = ApiSecretKey.check(
      config.get("SHOPIFY_API_SECRET_KEY"),
    );
    const hostUrl = Url.check(config.get("HOST_URL"));
    const accessTokenRepository = DynamoAccessTokenRepository.build(tableName);
    const webhookTestRepository = DynamoWebhookTestRepository.build(tableName);
    const shopifyGraphQlClient = ShopifyGraphQlClient.buildPrivate(
      shopifyApiKey,
      shopifyApiSecretKey,
    );
    const collectionService = new GqlCollectionService(shopifyGraphQlClient);
    const webhookService = new GqlWebhookService(shopifyGraphQlClient);
    const webhookHandler = new WebhookHandler({
      "collections/create": async (shopId, data) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const title = Guid.check(data.title);

        await webhookTestRepository.put(shopId, title);
      },
    });

    return {
      shopifyApiKey,
      shopifyApiSecretKey,
      hostUrl,
      accessTokenRepository,
      webhookHandler,
      collectionService,
      webhookService,
    };
  };
}
