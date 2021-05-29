import { Request, Response, Router } from "express";
import {
  AccessScope,
  StartInstallRequest,
  CompleteInstallRequest,
  IAccessTokenRepository,
  AuthHandler,
  ApiKey,
  ApiSecretKey,
  ShopId,
  Url,
} from "@tsukiy0/shopify-app-core";
import path from "path";
import { promisifyHandler } from "./utils/promisifyHandler";
import {
  GqlAppInstallationService,
  HttpOAuthService,
  ShopifyGraphQlClient,
} from "@tsukiy0/shopify-app-infrastructure";
import { RequestVerifier } from "../utils/RequestVerifier";

export class AuthRouter {
  constructor(
    private readonly accessTokenRepository: IAccessTokenRepository,
    private readonly config: {
      requiredScopes: AccessScope[];
      hostUrl: Url;
      appUrl: Url;
      apiKey: ApiKey;
      apiSecretKey: ApiSecretKey;
      onComplete: (shopId: ShopId) => Promise<void>;
    },
  ) {}

  build = (): Router => {
    const router = Router();

    const oAuthService = new HttpOAuthService();
    const shopifyGraphQlClient = new ShopifyGraphQlClient(
      this.accessTokenRepository,
    );
    const appInstallationService = new GqlAppInstallationService(
      shopifyGraphQlClient,
    );

    const handler = new AuthHandler(
      this.accessTokenRepository,
      oAuthService,
      appInstallationService,
      {
        apiKey: this.config.apiKey,
        apiSecretKey: this.config.apiSecretKey,
      },
    );

    const requestVerifier = new RequestVerifier({
      apiSecretKey: this.config.apiSecretKey,
    });

    const verifyHmacQueryMiddleware = promisifyHandler(async (req, res) => {
      const query = req.query;
      requestVerifier.verifyHmacQuery(query);
    });

    router.use("/shopify/auth", verifyHmacQueryMiddleware);

    router.get(
      "/shopify/auth/start",
      promisifyHandler(async (req, res) => {
        const redirectUrl = this.buildUrl("/shopify/auth/complete");
        const appUrl = this.buildAppUrl(this.config.appUrl, req.query);
        const shopId = ShopId.check(req.query.shop);

        const response = await handler.startInstall(
          StartInstallRequest.check({
            shopId,
            requiredScopes: this.config.requiredScopes,
            redirectUrl,
          }),
        );

        if (response.authorizeUrl) {
          return res.redirect(response.authorizeUrl);
        }

        return res.redirect(appUrl);
      }),
    );

    router.get(
      "/shopify/auth/complete",
      promisifyHandler(async (req, res) => {
        const shopId = ShopId.check(req.query.shop);

        await handler.completeInstall(
          CompleteInstallRequest.check({
            shopId,
            accessCode: req.query.code,
          }),
        );

        const url = await appInstallationService.getAppUrl(shopId);

        await this.config.onComplete(shopId);

        res.redirect(url);
      }),
    );

    return router;
  };

  private buildUrl = (appendPath: string): Url => {
    const newUrl = new URL(this.config.hostUrl);
    newUrl.pathname = path.join(newUrl.pathname, appendPath);
    return newUrl.toString();
  };

  private buildAppUrl = (appUrl: Url, query: Request["query"]): Url => {
    const url = new URL(appUrl);
    Object.entries(query).forEach(([key, value]) => {
      url.searchParams.append(key, value as string);
    });
    return url.toString();
  };
}
